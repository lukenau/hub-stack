import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "bridge" / "gen"))
import server_pb2

from murmur.bridge.command_poller import CommandPoller
from murmur.bridge.framing import Reassembler
from murmur.bridge.status import StatusReporter


class FakeRunner:
    def __init__(self, ok=True):
        self.ok = ok
        self.calls = []

    def __call__(self, argv):
        self.calls.append(argv)
        return self.ok


def _decode(frames):
    r = Reassembler()
    out = None
    for f in frames:
        got = r.feed(f)
        out = got if got is not None else out
    cmd = server_pb2.ServerCommandMsg()
    cmd.ParseFromString(out)
    return cmd


def _write_commands(path, cmds):
    path.write_text("\n".join(json.dumps(c) for c in cmds) + "\n")


# ---------- pull (rsync, injectable runner — no live Pi/VPS) ----------

def test_pull_invokes_rsync_from_remote_to_local(tmp_path):
    local = tmp_path / "commands.json"
    runner = FakeRunner(ok=True)
    poller = CommandPoller(local, remote="agent@vps:/srv/murmur/commands.json", runner=runner)
    assert poller.pull() is True
    assert runner.calls == [["rsync", "-a", "agent@vps:/srv/murmur/commands.json", str(local)]]


def test_pull_without_configured_remote_is_a_noop(tmp_path):
    runner = FakeRunner()
    poller = CommandPoller(tmp_path / "commands.json", remote=None, runner=runner)
    assert poller.pull() is False
    assert runner.calls == []


def test_pull_surfaces_runner_failure(tmp_path):
    runner = FakeRunner(ok=False)
    poller = CommandPoller(tmp_path / "commands.json", remote="host:src", runner=runner)
    assert poller.pull() is False


# ---------- unseen (pure local parsing) ----------

def test_unseen_returns_empty_when_local_file_absent(tmp_path):
    poller = CommandPoller(tmp_path / "missing.json", remote=None, runner=lambda argv: True)
    assert poller.unseen(None) == []


def test_unseen_returns_all_when_no_last_command_id_yet(tmp_path):
    local = tmp_path / "commands.json"
    _write_commands(local, [{"id": 1, "action": "murmur.drain_now"}, {"id": 2, "action": "murmur.drain_now"}])
    poller = CommandPoller(local, remote=None, runner=lambda argv: True)
    assert [c["id"] for c in poller.unseen(None)] == [1, 2]


def test_unseen_filters_already_seen_ids_and_sorts_ascending(tmp_path):
    local = tmp_path / "commands.json"
    _write_commands(local, [
        {"id": 3, "action": "murmur.drain_now", "requested_at": "t3"},
        {"id": 1, "action": "murmur.drain_now", "requested_at": "t1"},
        {"id": 2, "action": "murmur.drain_now", "requested_at": "t2"},
    ])
    poller = CommandPoller(local, remote=None, runner=lambda argv: True)
    assert [c["id"] for c in poller.unseen(1)] == [2, 3]


def test_unseen_skips_malformed_lines_and_lines_missing_an_int_id(tmp_path):
    local = tmp_path / "commands.json"
    local.write_text('not json\n{"action": "murmur.drain_now"}\n{"id": "not-an-int"}\n{"id": 5, "action": "murmur.drain_now"}\n')
    poller = CommandPoller(local, remote=None, runner=lambda argv: True)
    assert [c["id"] for c in poller.unseen(None)] == [5]


# ---------- apply (pure dispatch: proto frames + reporter state) ----------

def test_apply_drain_now_returns_download_flash_pages_frames_and_advances_id(tmp_path):
    poller = CommandPoller(tmp_path / "x", remote=None, runner=lambda argv: True)
    reporter = StatusReporter(tmp_path / "status.json", remote=None)
    frames = poller.apply({"id": 7, "action": "murmur.drain_now"}, reporter)
    cmd = _decode(frames)
    assert cmd.WhichOneof("content") == "download_flash_pages"
    assert reporter.last_command_id == 7
    assert reporter.state == "disconnected"  # drain_now doesn't touch capture state


def test_apply_capture_pause_returns_stop_recording_and_sets_paused(tmp_path):
    poller = CommandPoller(tmp_path / "x", remote=None, runner=lambda argv: True)
    reporter = StatusReporter(tmp_path / "status.json", remote=None)
    reporter.on_connect()
    frames = poller.apply({"id": 8, "action": "murmur.capture_pause"}, reporter)
    cmd = _decode(frames)
    assert cmd.WhichOneof("content") == "stop_recording"
    assert reporter.state == "paused"
    assert reporter.last_command_id == 8


def test_apply_capture_resume_returns_start_recording_and_sets_recording(tmp_path):
    poller = CommandPoller(tmp_path / "x", remote=None, runner=lambda argv: True)
    reporter = StatusReporter(tmp_path / "status.json", remote=None)
    reporter.on_pause()
    frames = poller.apply({"id": 9, "action": "murmur.capture_resume"}, reporter)
    cmd = _decode(frames)
    assert cmd.WhichOneof("content") == "start_recording"
    assert reporter.state == "recording"
    assert reporter.last_command_id == 9


def test_apply_unknown_action_sends_no_frames_but_still_advances_last_command_id(tmp_path):
    poller = CommandPoller(tmp_path / "x", remote=None, runner=lambda argv: True)
    reporter = StatusReporter(tmp_path / "status.json", remote=None)
    frames = poller.apply({"id": 10, "action": "murmur.mystery"}, reporter)
    assert frames == []
    assert reporter.last_command_id == 10


# ---------- poll (pull + unseen together) ----------

def test_poll_pulls_then_returns_unseen_commands(tmp_path):
    local = tmp_path / "commands.json"
    _write_commands(local, [{"id": 1, "action": "murmur.drain_now"}])
    runner = FakeRunner(ok=True)
    poller = CommandPoller(local, remote="host:src", runner=runner)
    cmds = poller.poll(last_command_id=None)
    assert runner.calls == [["rsync", "-a", "host:src", str(local)]]
    assert [c["id"] for c in cmds] == [1]


def test_poll_still_reads_local_cache_when_pull_fails(tmp_path):
    local = tmp_path / "commands.json"
    _write_commands(local, [{"id": 4, "action": "murmur.drain_now"}])
    poller = CommandPoller(local, remote="host:src", runner=lambda argv: False)
    # rsync unreachable this cycle — fall back to whatever was last pulled, never crash
    cmds = poller.poll(last_command_id=None)
    assert [c["id"] for c in cmds] == [4]


def test_implausible_future_id_cannot_poison_the_watermark(tmp_path):
    # F7: murmur-commands.json is shared state on the VPS; one line carrying
    # 2**63-1 would otherwise swallow every future WebAuthn-verified command.
    import time
    p = tmp_path / "commands.json"
    good = time.time_ns()
    p.write_text(
        json.dumps({"id": 9223372036854775807, "action": "murmur.capture_pause"}) + "\n"
        + json.dumps({"id": good, "action": "murmur.drain_now"}) + "\n"
    )
    cmds = CommandPoller(p, None, runner=lambda argv: True).unseen(None)
    assert [c["id"] for c in cmds] == [good]
