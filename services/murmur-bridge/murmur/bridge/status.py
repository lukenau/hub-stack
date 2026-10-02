import json
import logging
import pathlib
import subprocess
import time
from datetime import datetime, timezone

from .chronicle_client import sanitize_error

logger = logging.getLogger(__name__)


def _iso(ts: float | None = None) -> str:
    t = time.time() if ts is None else ts
    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def default_runner(argv: list[str]) -> bool:
    """subprocess.run wrapper — the ONLY place a real `rsync` gets shelled out.
    Tests inject a fake in its place; never called from the test suite."""
    try:
        subprocess.run(argv, capture_output=True, timeout=30, check=True)
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        logger.warning("runner failed: %s", argv, exc_info=True)
        return False


class StatusReporter:
    """The bridge's own liveness + pendant-telemetry snapshot. Written locally
    every cycle and rsync-pushed to the hub server, where the host-side status
    consumer reads it (tolerating absence — the push is best-effort).

    All BLE-facing hooks (on_connect/on_pause/on_device_status/...) are plain
    sync state updates the daemon calls inline from its event loop; only
    push() shells out, and only through the injectable `runner`.
    """

    def __init__(self, status_path, remote: str | None, runner=default_runner):
        self.status_path = pathlib.Path(status_path)
        self.remote = remote
        self._runner = runner
        self.state = "disconnected"
        self.battery_pct: int | None = None
        self.flash_used_pages: int | None = None
        self.flash_total_pages: int | None = None
        self.last_device_status_at: str | None = None
        self.queue_wavs = 0
        self.last_upload_at: str | None = None
        self.last_error: str | None = None
        # Restart-safe watermark: without this, every process restart re-reads
        # last_command_id as None and CommandPoller.unseen() replays the ENTIRE
        # command history as real BLE writes (re-pausing/resuming/re-draining
        # everything ever queued). Loaded from the status file THIS daemon itself
        # last wrote — missing/corrupt file means "never ran before", not an error.
        persisted = self._load_persisted()
        v = persisted.get("last_command_id")
        self.last_command_id: int | None = v if isinstance(v, int) else None
        # Pause is the system's only consent control, so its intent must outlive
        # both a reconnect and a daemon restart: without this, on_connect() would
        # claim "recording" for a pendant the operator deliberately paused.
        self.paused = bool(persisted.get("paused"))
        if self.paused:
            self.state = "paused"

    def _load_persisted(self) -> dict:
        try:
            data = json.loads(self.status_path.read_text())
        except (OSError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def on_connect(self) -> None:
        self.state = "paused" if self.paused else "recording"

    def on_disconnect(self) -> None:
        self.state = "disconnected"

    def on_pause(self) -> None:
        self.paused = True
        self.state = "paused"

    def on_resume(self) -> None:
        self.paused = False
        self.state = "recording"

    def on_device_status(self, msg, now: float | None = None) -> None:
        """msg is a server_pb2.DeviceStatus (from a GetDeviceStatus response)."""
        if msg.HasField("battery_status"):
            self.battery_pct = msg.battery_status.soc
        if msg.HasField("storage_state"):
            ss = msg.storage_state
            self.flash_total_pages = ss.total_capture_pages
            self.flash_used_pages = ss.total_capture_pages - ss.free_capture_pages
        self.last_device_status_at = _iso(now)

    def on_battery(self, msg, now: float | None = None) -> None:
        """msg is a shared_pb2.BatteryStatus (the pendant's unsolicited push —
        it carries no storage_state, so it cannot go through on_device_status)."""
        self.battery_pct = msg.soc
        self.last_device_status_at = _iso(now)

    def on_upload(self, ok: bool, error: str | None = None, now: float | None = None) -> None:
        if ok:
            self.last_upload_at = _iso(now)
            self.last_error = None
        else:
            self.last_error = sanitize_error(error or "upload failed")

    def on_error(self, error: str) -> None:
        self.last_error = sanitize_error(error)

    def set_queue_wavs(self, n: int) -> None:
        self.queue_wavs = n

    def snapshot(self, now: float | None = None) -> dict:
        return {
            "state": self.state,
            "battery_pct": self.battery_pct,
            "flash_used_pages": self.flash_used_pages,
            "flash_total_pages": self.flash_total_pages,
            "last_device_status_at": self.last_device_status_at,
            "queue_wavs": self.queue_wavs,
            "last_upload_at": self.last_upload_at,
            "last_error": self.last_error,
            "last_command_id": self.last_command_id,
            "paused": self.paused,
            "heartbeat": _iso(now),
        }

    def write(self, now: float | None = None) -> None:
        self.status_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.status_path.with_suffix(self.status_path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.snapshot(now)) + "\n")
        tmp.replace(self.status_path)

    def push(self) -> bool:
        if not self.remote:
            return False
        return self._runner(["rsync", "-a", str(self.status_path), self.remote])

    def write_and_push(self, now: float | None = None) -> bool:
        self.write(now)
        return self.push()
