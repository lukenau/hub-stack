import json
import logging
import pathlib
import time

from . import commands as proto_commands
from .status import default_runner

logger = logging.getLogger(__name__)

# Command ids are `time.time_ns()` (services/hub-api/app.py). The file they
# arrive in is shared state on the VPS, so a single garbled or hostile line
# carrying e.g. 2**63-1 would advance last_command_id past every future
# timestamp and silently swallow EVERY later WebAuthn-verified command, across
# restarts, forever. Anything implausibly far in the future is not a command.
MAX_ID_SKEW_NS = 3_600 * 1_000_000_000

# murmur.drain_now reuses the existing on-connect drain trigger; the other two
# are the NEW encoders (commands.py, ServerCommandMsg fields 17/18).
ACTIONS = {
    "murmur.drain_now": lambda: proto_commands.download_flash_pages(batch=True, real_time=False),
    "murmur.capture_pause": proto_commands.stop_recording,
    "murmur.capture_resume": proto_commands.start_recording,
}


class CommandPoller:
    """Pulls hub-api's murmur-commands.json (JSONL, one {id, action, requested_at}
    per line — see services/hub-api/app.py) over rsync and executes unseen ids.

    Split into pull() (I/O, injectable runner) / unseen() (pure parse) / apply()
    (pure dispatch: proto frames + reporter state) so each is testable without a
    live Pi or VPS — same fake-transport style as DrainStateMachine's tests.
    """

    def __init__(self, local_path, remote: str | None, runner=default_runner):
        self.local_path = pathlib.Path(local_path)
        self.remote = remote
        self._runner = runner

    def pull(self) -> bool:
        if not self.remote:
            return False
        return self._runner(["rsync", "-a", self.remote, str(self.local_path)])

    def unseen(self, last_command_id: int | None) -> list[dict]:
        if not self.local_path.exists():
            return []
        out: list[dict] = []
        for line in self.local_path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
            except json.JSONDecodeError:
                continue
            cid = cmd.get("id")
            if not isinstance(cid, int) or isinstance(cid, bool):
                continue
            if cid > time.time_ns() + MAX_ID_SKEW_NS:
                logger.error("murmur command id %s is implausibly far in the future; ignoring", cid)
                continue
            if last_command_id is not None and cid <= last_command_id:
                continue
            out.append(cmd)
        out.sort(key=lambda c: c["id"])
        return out

    def apply(self, cmd: dict, reporter) -> list[bytes]:
        """Pure: returns the BLE frames for cmd (empty for an unknown action),
        applies its effect on `reporter` (pause/resume), and always advances
        reporter.last_command_id — an unrecognized action must not be retried
        forever."""
        action = cmd.get("action")
        builder = ACTIONS.get(action)
        frames: list[bytes] = []
        if builder is None:
            logger.warning("unknown murmur command action %r (id=%s)", action, cmd.get("id"))
        else:
            frames = builder()
            if action == "murmur.capture_pause":
                reporter.on_pause()
            elif action == "murmur.capture_resume":
                reporter.on_resume()
        reporter.last_command_id = cmd.get("id")
        return frames

    def poll(self, last_command_id: int | None) -> list[dict]:
        """pull() then unseen() — a pull failure (VPS/tailnet unreachable this
        cycle) falls back to whatever was last pulled rather than dropping
        commands, matching bridge-status.json's own tolerate-absence contract."""
        self.pull()
        return self.unseen(last_command_id)
