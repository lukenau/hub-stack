import asyncio
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "bridge" / "gen"))
import server_pb2

from murmur.bridge.command_poller import CommandPoller
from murmur.bridge.daemon import _cancel, _command_loop, _command_tick, _status_loop, _status_tick
from murmur.bridge.status import StatusReporter


class FakeRunner:
    def __init__(self, ok=True):
        self.ok = ok
        self.calls = []

    def __call__(self, argv):
        self.calls.append(argv)
        return self.ok


def _write_commands(path, cmds):
    path.write_text("\n".join(json.dumps(c) for c in cmds) + "\n")


# ---------- StatusReporter: state transitions ----------

def test_initial_state_is_disconnected_with_all_live_fields_null():
    r = StatusReporter("unused", remote=None)
    snap = r.snapshot(now=1_756_700_000)
    assert snap["state"] == "disconnected"
    assert snap["battery_pct"] is None
    assert snap["flash_used_pages"] is None
    assert snap["flash_total_pages"] is None
    assert snap["last_device_status_at"] is None
    assert snap["queue_wavs"] == 0
    assert snap["last_upload_at"] is None
    assert snap["last_error"] is None
    assert snap["last_command_id"] is None


def test_heartbeat_is_iso_utc_for_given_ts():
    r = StatusReporter("unused", remote=None)
    assert r.snapshot(now=1_756_700_000)["heartbeat"] == "2025-09-01T04:13:20Z"


def test_on_connect_sets_recording_and_on_disconnect_reverts():
    r = StatusReporter("unused", remote=None)
    r.on_connect()
    assert r.state == "recording"
    r.on_disconnect()
    assert r.state == "disconnected"


def test_on_pause_and_on_resume_toggle_state():
    r = StatusReporter("unused", remote=None)
    r.on_connect()
    r.on_pause()
    assert r.state == "paused"
    r.on_resume()
    assert r.state == "recording"


def test_on_device_status_populates_battery_and_flash_pages():
    msg = server_pb2.DeviceStatus()
    msg.battery_status.soc = 73
    msg.storage_state.total_capture_pages = 500
    msg.storage_state.free_capture_pages = 120
    r = StatusReporter("unused", remote=None)
    r.on_device_status(msg, now=1_756_700_000)
    assert r.battery_pct == 73
    assert r.flash_total_pages == 500
    assert r.flash_used_pages == 380  # total - free
    assert r.last_device_status_at == "2025-09-01T04:13:20Z"


def test_on_device_status_without_battery_or_storage_leaves_fields_null():
    msg = server_pb2.DeviceStatus()
    msg.led_brightness = 5
    r = StatusReporter("unused", remote=None)
    r.on_device_status(msg, now=1_756_700_000)
    assert r.battery_pct is None
    assert r.flash_total_pages is None
    assert r.flash_used_pages is None
    assert r.last_device_status_at == "2025-09-01T04:13:20Z"  # we DID hear from the pendant


def test_on_upload_success_sets_last_upload_at():
    r = StatusReporter("unused", remote=None)
    r.on_upload(True, now=1_756_700_000)
    assert r.last_upload_at == "2025-09-01T04:13:20Z"
    assert r.last_error is None


def test_on_upload_failure_sets_last_error_leaves_last_upload_at_alone():
    r = StatusReporter("unused", remote=None)
    r.on_upload(True, now=1_756_700_000)
    r.on_upload(False, error="connection refused")
    assert r.last_upload_at == "2025-09-01T04:13:20Z"
    assert r.last_error == "connection refused"


def test_set_queue_wavs():
    r = StatusReporter("unused", remote=None)
    r.set_queue_wavs(3)
    assert r.snapshot()["queue_wavs"] == 3


# ---------- StatusReporter: last_command_id restart persistence ----------
# Without this, every process restart forgets last_command_id -> CommandPoller
# replays the ENTIRE command history as real BLE writes (re-pause/resume/re-drain
# everything ever queued). The watermark rides in the same status file already
# written every cycle — no new file, no new format.

def test_no_status_file_yet_starts_with_no_last_command_id(tmp_path):
    r = StatusReporter(tmp_path / "never-written.json", remote=None)
    assert r.last_command_id is None


def test_corrupt_status_file_starts_with_no_last_command_id(tmp_path):
    path = tmp_path / "status.json"
    path.write_text("not json")
    r = StatusReporter(path, remote=None)
    assert r.last_command_id is None


def test_status_file_missing_last_command_id_key_starts_with_none(tmp_path):
    path = tmp_path / "status.json"
    path.write_text(json.dumps({"state": "disconnected"}))
    r = StatusReporter(path, remote=None)
    assert r.last_command_id is None


def test_last_command_id_persists_across_restart(tmp_path):
    path = tmp_path / "status.json"
    r1 = StatusReporter(path, remote=None)
    r1.last_command_id = 42
    r1.write(now=1_756_700_000)

    r2 = StatusReporter(path, remote=None)  # simulates a fresh process start
    assert r2.last_command_id == 42


def test_restart_simulation_never_replays_already_executed_commands(tmp_path):
    status_path = tmp_path / "status.json"
    commands_path = tmp_path / "commands.json"
    _write_commands(commands_path, [
        {"id": 1, "action": "murmur.drain_now"},
        {"id": 2, "action": "murmur.drain_now"},
    ])
    poller = CommandPoller(commands_path, remote=None, runner=lambda argv: True)

    r1 = StatusReporter(status_path, remote=None)
    for cmd in poller.unseen(r1.last_command_id):
        poller.apply(cmd, r1)
    r1.write(now=1_756_700_000)
    assert r1.last_command_id == 2

    # Process restarts — a brand-new StatusReporter instance on the same path.
    r2 = StatusReporter(status_path, remote=None)
    assert r2.last_command_id == 2
    assert poller.unseen(r2.last_command_id) == []  # nothing re-executed


# ---------- StatusReporter: local write + rsync push ----------

def test_write_creates_status_file_atomically_no_tmp_left_behind(tmp_path):
    path = tmp_path / "status.json"
    r = StatusReporter(path, remote=None)
    r.on_connect()
    r.write(now=1_756_700_000)
    assert path.exists()
    data = json.loads(path.read_text())
    assert data["state"] == "recording"
    assert not list(tmp_path.glob("*.tmp"))


def test_push_invokes_runner_with_rsync_argv():
    path = pathlib.Path("/tmp/does-not-need-to-exist-for-this-test/status.json")
    runner = FakeRunner(ok=True)
    remote = "agent@example-host:/srv/murmur/bridge-status.json"
    r = StatusReporter(path, remote=remote, runner=runner)
    assert r.push() is True
    assert runner.calls == [["rsync", "-a", str(path), remote]]


def test_push_without_configured_remote_is_a_noop():
    runner = FakeRunner()
    r = StatusReporter("unused", remote=None, runner=runner)
    assert r.push() is False
    assert runner.calls == []


def test_push_surfaces_runner_failure():
    runner = FakeRunner(ok=False)
    r = StatusReporter("unused", remote="host:dest", runner=runner)
    assert r.push() is False


def test_write_and_push_does_both(tmp_path):
    path = tmp_path / "status.json"
    runner = FakeRunner(ok=True)
    r = StatusReporter(path, remote="host:dest", runner=runner)
    ok = r.write_and_push(now=1_756_700_000)
    assert ok is True
    assert path.exists()
    assert len(runner.calls) == 1


# ---------- daemon loop ticks (async, no live Pi — same fake-transport style
# as test_daemon_drain.py) ----------

def test_status_tick_writes_pushes_and_counts_queued_wavs(tmp_path):
    async def body():
        (tmp_path / "session1_a.wav").write_bytes(b"x")
        (tmp_path / "session2_b.wav").write_bytes(b"x")
        path = tmp_path / "status.json"
        runner = FakeRunner(ok=True)
        reporter = StatusReporter(path, remote="host:dest", runner=runner)
        await _status_tick(reporter, store_dir=tmp_path)
        assert reporter.queue_wavs == 2
        assert path.exists()
        assert len(runner.calls) == 1

    asyncio.run(body())


def test_command_tick_pulls_dispatches_frames_and_advances_last_command_id(tmp_path):
    async def body():
        local = tmp_path / "commands.json"
        _write_commands(local, [{"id": 1, "action": "murmur.drain_now", "requested_at": "t1"}])
        runner = FakeRunner(ok=True)
        poller = CommandPoller(local, remote="host:src", runner=runner)
        reporter = StatusReporter(tmp_path / "status.json", remote=None)
        written = []

        async def write(fr):
            written.append(fr)

        await _command_tick(poller, reporter, write)
        assert reporter.last_command_id == 1
        assert len(written) > 0
        assert runner.calls == [["rsync", "-a", "host:src", str(local)]]

    asyncio.run(body())


def test_command_tick_is_idempotent_on_second_call_with_no_new_commands(tmp_path):
    async def body():
        local = tmp_path / "commands.json"
        _write_commands(local, [{"id": 1, "action": "murmur.drain_now", "requested_at": "t1"}])
        poller = CommandPoller(local, remote=None, runner=lambda argv: True)
        reporter = StatusReporter(tmp_path / "status.json", remote=None)
        written = []

        async def write(fr):
            written.append(fr)

        await _command_tick(poller, reporter, write)
        first_len = len(written)
        await _command_tick(poller, reporter, write)
        assert len(written) == first_len  # id 1 already seen — nothing re-sent
        assert reporter.last_command_id == 1

    asyncio.run(body())


# ---------- tick resilience: one bad tick must not kill the loop ----------

def test_status_tick_swallows_exception_and_a_later_tick_still_works(tmp_path):
    async def body():
        path = tmp_path / "status.json"
        runner = FakeRunner(ok=True)
        reporter = StatusReporter(path, remote="host:dest", runner=runner)

        class ExplodingReporter:
            last_command_id = None

            def set_queue_wavs(self, n):
                pass

            def write_and_push(self):
                raise RuntimeError("disk full")

        # First tick's underlying work raises -> must not propagate.
        await _status_tick(ExplodingReporter(), store_dir=tmp_path)

        # Loop keeps going: a normal tick right after still succeeds.
        await _status_tick(reporter, store_dir=tmp_path)
        assert path.exists()
        assert len(runner.calls) == 1

    asyncio.run(body())


def test_command_tick_swallows_exception_and_a_later_tick_still_works(tmp_path):
    async def body():
        local = tmp_path / "commands.json"
        _write_commands(local, [{"id": 1, "action": "murmur.drain_now"}])

        class ExplodingPoller:
            def poll(self, last_command_id):
                raise RuntimeError("rsync exploded")

        reporter = StatusReporter(tmp_path / "status.json", remote=None)
        written = []

        async def write(fr):
            written.append(fr)

        # First tick's poll() raises -> must not propagate.
        await _command_tick(ExplodingPoller(), reporter, write)
        assert reporter.last_command_id is None  # nothing was processed

        # Loop keeps going: a normal tick right after still works.
        poller = CommandPoller(local, remote=None, runner=lambda argv: True)
        await _command_tick(poller, reporter, write)
        assert reporter.last_command_id == 1
        assert len(written) > 0

    asyncio.run(body())


def test_command_tick_swallows_a_write_failure_mid_dispatch(tmp_path):
    async def body():
        local = tmp_path / "commands.json"
        _write_commands(local, [{"id": 1, "action": "murmur.drain_now"}])
        poller = CommandPoller(local, remote=None, runner=lambda argv: True)
        reporter = StatusReporter(tmp_path / "status.json", remote=None)

        async def failing_write(fr):
            raise OSError("BLE write failed")

        await _command_tick(poller, reporter, failing_write)  # must not raise

        # A subsequent tick with a working write still functions.
        written = []

        async def write(fr):
            written.append(fr)

        _write_commands(local, [{"id": 1, "action": "murmur.drain_now"}, {"id": 2, "action": "murmur.drain_now"}])
        await _command_tick(poller, reporter, write)
        assert len(written) > 0

    asyncio.run(body())


# ---------- loop tick-then-sleep ordering (fires promptly on reconnect) --------

async def _wait_until(predicate, timeout_s=2.0, step_s=0.01):
    elapsed = 0.0
    while not predicate() and elapsed < timeout_s:
        await asyncio.sleep(step_s)
        elapsed += step_s
    return predicate()


def test_status_loop_ticks_immediately_before_first_sleep(tmp_path):
    async def body():
        path = tmp_path / "status.json"
        runner = FakeRunner(ok=True)
        reporter = StatusReporter(path, remote="host:dest", runner=runner)
        task = asyncio.create_task(_status_loop(reporter, store_dir=tmp_path, interval=3600))
        try:
            # Written on the FIRST iteration — no 3600s wait needed to observe it.
            assert await _wait_until(lambda: path.exists())
            assert len(runner.calls) == 1
        finally:
            await _cancel(task)

    asyncio.run(body())


def test_command_loop_ticks_immediately_before_first_sleep(tmp_path):
    async def body():
        local = tmp_path / "commands.json"
        _write_commands(local, [{"id": 1, "action": "murmur.drain_now"}])
        poller = CommandPoller(local, remote=None, runner=lambda argv: True)
        reporter = StatusReporter(tmp_path / "status.json", remote=None)
        written = []

        async def write(fr):
            written.append(fr)

        task = asyncio.create_task(_command_loop(poller, reporter, write, interval=3600))
        try:
            # Processed on the FIRST iteration — no 3600s wait needed to observe it.
            assert await _wait_until(lambda: reporter.last_command_id == 1)
            assert len(written) > 0
        finally:
            await _cancel(task)

    asyncio.run(body())


def test_pause_intent_survives_reconnect_and_restart(tmp_path):
    # F9: pause is the only consent control — on_connect() must not fabricate
    # "recording" for a pendant the operator deliberately paused.
    path = tmp_path / "status.json"
    r = StatusReporter(path, None, runner=lambda argv: True)
    r.on_pause()
    r.on_disconnect()
    r.on_connect()
    assert r.state == "paused"

    r.write()
    revived = StatusReporter(path, None, runner=lambda argv: True)
    revived.on_connect()
    assert revived.state == "paused"

    revived.on_resume()
    revived.write()
    again = StatusReporter(path, None, runner=lambda argv: True)
    again.on_connect()
    assert again.state == "recording"


def test_last_error_is_sanitized(tmp_path):
    r = StatusReporter(tmp_path / "s.json", None, runner=lambda argv: True)
    r.on_upload(False, "post to http://host/api/upload?token=supersecret failed")
    assert "supersecret" not in r.snapshot()["last_error"]


def test_successful_upload_clears_a_stale_error(tmp_path):
    r = StatusReporter(tmp_path / "s.json", None, runner=lambda argv: True)
    r.on_upload(False, "boom")
    r.on_upload(True)
    assert r.snapshot()["last_error"] is None
