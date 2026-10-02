import asyncio
import contextlib
import itertools
import logging
import pathlib
import sys
import time
import tomllib
from dataclasses import dataclass

from . import commands
from .audio import StalePage, UnreadableAudio, WavSession, extract_opus_frames
from .chronicle_client import ChronicleClient
from .command_poller import CommandPoller
from .framing import Reassembler
from .status import StatusReporter

TX_UUID = "632de002-604c-446b-a80f-7963e950f3fb"
RX_UUID = "632de003-604c-446b-a80f-7963e950f3fb"

MAX_SESSION_MS = 30 * 60 * 1000

_SENTINEL = object()


class DrainStateMachine:
    def __init__(self, store_dir, client, session_gap_ms: int = 60_000, reporter=None):
        self.store_dir = pathlib.Path(store_dir)
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self._client = client
        self._reporter = reporter
        self.session_gap_ms = session_gap_ms
        self._session_ids = itertools.count(1)
        self._session = None
        self._session_start_ms = None
        self._last_page_ms = None
        self._session_indexes: list[int] = []
        self._pending: set[int] = set()
        self._resolved: set[int] = set()
        self._retry_queue: list[tuple[pathlib.Path, list[int], int]] = []
        self._watermark: int | None = None
        # Flash-page indexes are namespaced by (session, run), NOT globally
        # monotonic: a factory reset or a firmware-side storage-session roll
        # restarts them near zero. Keying the watermark on the namespace is what
        # stops a stale high-water mark from suppressing every future ACK.
        self._namespace: tuple[int, int] | None = None

    def on_payload(self, payload: bytes) -> list[list[bytes]]:
        kind, msg = commands.parse_response(payload)
        if kind == "device_status":
            if self._reporter is not None:
                self._reporter.on_device_status(msg)
            return []
        if kind == "battery":
            if self._reporter is not None:
                self._reporter.on_battery(msg)
            return []
        if kind != "storage_buffer":
            return []

        (self.store_dir / "heartbeat").touch()

        namespace = (msg.session, msg.run)
        if self._namespace is None:
            self._namespace = namespace
        elif namespace != self._namespace:
            logging.error(
                "flash-page namespace changed %s -> %s (factory reset or storage-session roll); "
                "flushing un-uploaded local audio (best-effort) then resetting watermark/resolved/pending",
                self._namespace, namespace,
            )
            self._reset_namespace(namespace)

        try:
            ts, frames = extract_opus_frames(msg.flash_page)
        except UnreadableAudio:
            # Real audio in a codec field we cannot decode. Resolving it would
            # ACK-delete the only copy, so keep the page on the pendant and say so.
            logging.error(
                "flash page %s carries audio in an unreadable codec field; keeping it on the pendant",
                msg.index,
            )
            self._pending.add(msg.index)
            if self._reporter is not None:
                self._reporter.on_error(f"unreadable audio codec on flash page {msg.index}")
            return []
        except StalePage as e:
            logging.error("flash page %s has a pre-2020 timestamp (%s); resolving it for the watermark",
                          msg.index, e)
            return self._resolve_immediately(msg.index)

        if not frames:
            return self._resolve_immediately(msg.index)

        out: list[list[bytes]] = []
        if self._session is not None:
            gap = ts - self._last_page_ms
            length = ts - self._session_start_ms
            if gap > self.session_gap_ms or length > MAX_SESSION_MS:
                out = self._close_session()

        if self._session is None:
            self._session = WavSession(self.store_dir, next(self._session_ids), ts)
            self._session_start_ms = ts
            self._session_indexes = []

        self._session.add_frames(frames)
        self._session_indexes.append(msg.index)
        self._pending.add(msg.index)
        self._last_page_ms = ts
        return out

    def on_disconnect(self) -> None:
        if self._session is not None:
            path = self._session.close()
            path.unlink(missing_ok=True)
            self._pending.difference_update(self._session_indexes)
            self._session = None
            self._session_start_ms = None
            self._last_page_ms = None
            self._session_indexes = []
        for path, indexes, _start_ms in self._retry_queue:
            path.unlink(missing_ok=True)
            self._pending.difference_update(indexes)
        self._retry_queue = []

    def _reset_namespace(self, namespace: tuple[int, int]) -> None:
        # A namespace change (factory reset / storage-session roll) can coincide
        # with un-uploaded local audio (Chronicle briefly down). Unlike a real BLE
        # disconnect -- where un-ACKed pages persist on pendant flash and simply
        # re-drain -- the old namespace's indexes are about to become meaningless,
        # so this may be the only copy. Attempt a final upload before discarding
        # any bookkeeping; only unlink what actually uploaded.
        self._flush_unsaved_audio()
        self._namespace = namespace
        self._watermark = None
        self._resolved = set()
        self._pending = set()

    def _flush_unsaved_audio(self) -> None:
        if self._session is not None:
            path = self._session.close()
            start_ms = self._session_start_ms
            self._session = None
            self._session_start_ms = None
            self._last_page_ms = None
            self._session_indexes = []
            self._flush_wav(path, start_ms)

        retry_queue, self._retry_queue = self._retry_queue, []
        for path, _indexes, start_ms in retry_queue:
            self._flush_wav(path, start_ms)

    def _flush_wav(self, path: pathlib.Path, start_ms: int) -> None:
        result = self._client.upload_wav(path, start_ms)
        self._report_upload(result)
        if result:
            path.unlink(missing_ok=True)
        else:
            logging.error("namespace-reset flush failed to upload %s; keeping it on disk", path)

    def _report_upload(self, result) -> None:
        if self._reporter is not None:
            self._reporter.on_upload(bool(result), getattr(result, "error", None))

    def _resolve_immediately(self, index: int) -> list[list[bytes]]:
        self._resolved.add(index)
        return self._compute_ack()

    def _close_session(self) -> list[list[bytes]]:
        path = self._session.close()
        indexes = self._session_indexes
        start_ms = self._session_start_ms
        self._session = None
        self._session_start_ms = None
        self._last_page_ms = None
        self._session_indexes = []

        self._retry_pending()

        result = self._client.upload_wav(path, start_ms)
        self._report_upload(result)
        if result:
            self._resolved.update(indexes)
            self._pending.difference_update(indexes)
            path.unlink(missing_ok=True)
        else:
            self._retry_queue.append((path, indexes, start_ms))

        return self._compute_ack()

    def _retry_pending(self) -> None:
        still_pending = []
        for path, indexes, start_ms in self._retry_queue:
            result = self._client.upload_wav(path, start_ms)
            self._report_upload(result)
            if result:
                self._resolved.update(indexes)
                self._pending.difference_update(indexes)
                path.unlink(missing_ok=True)
            else:
                still_pending.append((path, indexes, start_ms))
        self._retry_queue = still_pending

    def _compute_ack(self) -> list[list[bytes]]:
        if self._pending:
            below = [i for i in self._resolved if i < min(self._pending)]
            candidate = max(below) if below else None
        else:
            candidate = max(self._resolved) if self._resolved else None

        if candidate is None or (self._watermark is not None and candidate <= self._watermark):
            return []

        self._watermark = candidate
        self._resolved = {i for i in self._resolved if i > self._watermark}
        return [commands.delete_flash_page(candidate)]


@dataclass
class Config:
    mac: str
    base_url: str
    # A Chronicle API key (`chrn_<prefix>_<secret>`, minted via POST /api/api-keys)
    # — NOT a login JWT. JWTs expire after JWT_LIFETIME_SECONDS (24h by default),
    # and an expired credential wedges the drain permanently: uploads fail, the
    # watermark never advances, and the pendant's flash buffer overwrites itself.
    api_key: str
    store_dir: pathlib.Path
    # Status/command sync with the VPS (Task 13 contract). None = feature off
    # (no rsync attempted) — the daemon still runs the drain pipeline fine.
    status_path: pathlib.Path = pathlib.Path("/var/lib/murmur-bridge/status.json")
    status_remote: str | None = None
    commands_path: pathlib.Path = pathlib.Path("/var/lib/murmur-bridge/commands.json")
    commands_remote: str | None = None
    status_interval_s: int = 60


def load_config(path) -> Config:
    with open(path, "rb") as f:
        data = tomllib.load(f)
    return Config(
        mac=data["mac"],
        base_url=data["base_url"],
        api_key=data["api_key"],
        store_dir=pathlib.Path(data["store_dir"]),
        status_path=pathlib.Path(data.get("status_path", "/var/lib/murmur-bridge/status.json")),
        status_remote=data.get("status_remote"),
        commands_path=pathlib.Path(data.get("commands_path", "/var/lib/murmur-bridge/commands.json")),
        commands_remote=data.get("commands_remote"),
        status_interval_s=int(data.get("status_interval_s", 60)),
    )


async def _status_tick(reporter: StatusReporter, store_dir=None) -> None:
    """One status write+push cycle. Swallows any exception (a bad rsync, a
    transient disk error) — matching run()'s own BLE-loop policy of logging and
    continuing to the next iteration rather than dying, since a single failed
    tick must never take the whole periodic loop down with it."""
    try:
        if store_dir is not None:
            reporter.set_queue_wavs(len(list(pathlib.Path(store_dir).glob("*.wav"))))
        await asyncio.to_thread(reporter.write_and_push)
    except Exception:
        logging.warning("status tick failed", exc_info=True)


async def _status_loop(reporter: StatusReporter, store_dir=None, interval: int = 60) -> None:
    # Tick-then-sleep (not sleep-then-tick): this task is created fresh on every
    # daemon startup and every reconnect, so a full `interval` of silence before
    # the FIRST push would leave a just-(re)connected bridge invisible for up to
    # a minute — and a fresh reconnect is exactly when an operator most wants to
    # see it come back.
    while True:
        await _status_tick(reporter, store_dir)
        await asyncio.sleep(interval)


async def _command_tick(poller: CommandPoller, reporter: StatusReporter, write) -> None:
    """One poll+dispatch cycle. Swallows any exception for the same reason as
    _status_tick — a bad rsync pull or a BLE write hiccup must not kill the
    command loop; the next scheduled tick will simply try again."""
    try:
        cmds = await asyncio.to_thread(poller.poll, reporter.last_command_id)
        for cmd in cmds:
            for fr in poller.apply(cmd, reporter):
                await write(fr)
    except Exception:
        logging.warning("command tick failed", exc_info=True)


async def _command_loop(poller: CommandPoller, reporter: StatusReporter, write, interval: int = 60) -> None:
    # Tick-then-sleep, same reasoning as _status_loop: this task is (re)created on
    # every BLE connect, so a queued command should execute promptly on reconnect
    # rather than waiting up to a full interval for the first poll.
    while True:
        await _command_tick(poller, reporter, write)
        await asyncio.sleep(interval)


async def _consume(queue, reasm: Reassembler, sm: DrainStateMachine, write, ack_exceptions) -> None:
    while True:
        item = await queue.get()
        if item is _SENTINEL:
            return
        # A corrupt protobuf, a misassembled fragment or a malformed Opus frame
        # must cost exactly one page, never the connection: an exception escaping
        # here used to skip teardown entirely, leaving an open WavSession whose
        # indexes stayed pending forever (no ACK ever again) while the reporter
        # kept claiming "recording".
        try:
            payload = reasm.feed(item)
            if payload is None:
                continue
            acks = await asyncio.to_thread(sm.on_payload, payload)
        except Exception:
            logging.warning("dropping unparseable BLE payload; page re-drains next connection", exc_info=True)
            continue
        for frames in acks:
            for fr in frames:
                try:
                    await write(fr)
                except ack_exceptions:
                    logging.warning("ack write failed after disconnect; page re-drains next connection")


async def _device_status_loop(write, interval: int = 60) -> None:
    """The pendant only reports battery + flash occupancy when ASKED. Without
    this poll, pendant.battery_pct / flash_used_pages are structurally null and
    the Hub's battery readout and flash gauge never render."""
    while True:
        try:
            for fr in commands.get_device_status():
                await write(fr)
        except Exception:
            logging.warning("device status poll failed", exc_info=True)
        await asyncio.sleep(interval)


async def _cancel(task) -> None:
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


async def run(cfg: Config) -> None:
    from bleak import BleakClient
    from bleak.exc import BleakError

    reporter = StatusReporter(cfg.status_path, cfg.status_remote)
    sm = DrainStateMachine(cfg.store_dir, ChronicleClient(cfg.base_url, cfg.api_key), reporter=reporter)
    poller = CommandPoller(cfg.commands_path, cfg.commands_remote)
    # Runs for the daemon's whole lifetime, connected or not — "disconnected"
    # is itself a status worth reporting (see StatusReporter.on_disconnect).
    status_task = asyncio.create_task(_status_loop(reporter, cfg.store_dir, cfg.status_interval_s))
    try:
        while True:
            try:
                async with BleakClient(cfg.mac, timeout=30) as client:
                    reporter.on_connect()
                    reasm = Reassembler()
                    queue: asyncio.Queue = asyncio.Queue()

                    def on_rx(_, data):
                        queue.put_nowait(bytes(data))

                    async def write(fr):
                        await client.write_gatt_char(TX_UUID, fr, response=False)

                    consumer = asyncio.create_task(_consume(queue, reasm, sm, write, (BleakError, OSError)))
                    # Command dispatch needs a live `write` — only runs while connected;
                    # commands queued during a disconnect are simply still "unseen" next connect.
                    command_task = asyncio.create_task(
                        _command_loop(poller, reporter, write, cfg.status_interval_s)
                    )
                    device_task = asyncio.create_task(_device_status_loop(write, cfg.status_interval_s))
                    try:
                        await client.pair()
                        await asyncio.sleep(1)
                        await client.start_notify(RX_UUID, on_rx)
                        for fr in commands.set_current_time(int(time.time() * 1000)):
                            await client.write_gatt_char(TX_UUID, fr, response=False)
                        await asyncio.sleep(1)
                        for fr in commands.get_device_status():
                            await client.write_gatt_char(TX_UUID, fr, response=False)
                        for fr in commands.download_flash_pages(batch=True, real_time=False):
                            await client.write_gatt_char(TX_UUID, fr, response=False)
                        while client.is_connected:
                            await asyncio.sleep(5)
                    finally:
                        await _cancel(command_task)
                        await _cancel(device_task)
                        queue.put_nowait(_SENTINEL)
                        # `await consumer` re-raises whatever killed the consumer
                        # task; the disconnect hooks must run regardless, or the
                        # next connection starts on corrupted state with a status
                        # file still claiming "recording".
                        try:
                            await consumer
                        finally:
                            sm.on_disconnect()
                            reporter.on_disconnect()
            except Exception as e:
                logging.warning("reconnect after: %s", e)
            await asyncio.sleep(5)
    finally:
        await _cancel(status_task)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    cfg = load_config(sys.argv[1])
    asyncio.run(run(cfg))


if __name__ == "__main__":
    main()
