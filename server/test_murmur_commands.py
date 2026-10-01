import json
import pathlib
import sys
import threading

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from app import _append_and_prune_commands  # noqa: E402


def _read_lines(path):
    return [json.loads(ln) for ln in path.read_text().splitlines() if ln.strip()]


def test_append_to_existing_empty_file(tmp_path):
    path = tmp_path / "commands.json"
    path.write_text("")
    _append_and_prune_commands(path, {"id": 1, "action": "murmur.drain_now"}, max_entries=50)
    assert [r["id"] for r in _read_lines(path)] == [1]


def test_append_preserves_existing_entries_under_the_limit(tmp_path):
    path = tmp_path / "commands.json"
    path.write_text("\n".join(json.dumps({"id": i}) for i in range(1, 4)) + "\n")
    _append_and_prune_commands(path, {"id": 4}, max_entries=50)
    assert [r["id"] for r in _read_lines(path)] == [1, 2, 3, 4]


def test_prunes_to_newest_max_entries_keeping_order(tmp_path):
    path = tmp_path / "commands.json"
    path.write_text("\n".join(json.dumps({"id": i}) for i in range(1, 51)) + "\n")  # 50 already
    _append_and_prune_commands(path, {"id": 51}, max_entries=50)
    ids = [r["id"] for r in _read_lines(path)]
    assert len(ids) == 50
    assert ids == list(range(2, 52))  # oldest (1) dropped, newest (51) kept, order preserved


def test_prune_is_a_noop_when_under_the_limit(tmp_path):
    path = tmp_path / "commands.json"
    path.write_text(json.dumps({"id": 1}) + "\n")
    _append_and_prune_commands(path, {"id": 2}, max_entries=50)
    assert [r["id"] for r in _read_lines(path)] == [1, 2]


def test_tolerates_malformed_lines_already_on_disk_without_crashing(tmp_path):
    # Pruning is line-count-based, not JSON-aware (matches CommandPoller.unseen(),
    # which already skips unparseable lines on the read side) — a bad line already
    # on disk must not crash the append, and simply rides along until it ages out
    # of the newest-N window like any other line.
    path = tmp_path / "commands.json"
    path.write_text('not json\n{"id": 1}\n')
    _append_and_prune_commands(path, {"id": 2}, max_entries=50)
    lines = [ln for ln in path.read_text().splitlines() if ln.strip()]
    assert lines == ["not json", '{"id": 1}', '{"id": 2}']


def test_requires_file_to_already_exist(tmp_path):
    # "r+" mode — mirrors the real constraint: hub-api can't create a NEW file in
    # /opt/hub-data/hub (no directory-write permission), only write into one that
    # murmur-derive.sh already pre-created. A missing file must raise, not silently
    # create one hub-api would then own with the wrong permissions.
    path = tmp_path / "missing.json"
    with pytest.raises(OSError):
        _append_and_prune_commands(path, {"id": 1}, max_entries=50)


def test_concurrent_appends_from_two_threads_both_survive(tmp_path):
    # Reproduces the review finding: two near-simultaneous gated murmur actions
    # (uvicorn's threadpool runs sync endpoints concurrently) must not let the
    # second writer's read-modify-write silently clobber the first's entry.
    # Barrier-synced so both threads are genuinely racing at the read/write step,
    # not just sequential calls that happen to run on different threads.
    path = tmp_path / "commands.json"
    path.write_text("")
    barrier = threading.Barrier(2)
    errors: list[Exception] = []

    def worker(cmd_id):
        try:
            barrier.wait(timeout=5)
            _append_and_prune_commands(path, {"id": cmd_id, "action": "murmur.drain_now"}, max_entries=50)
        except Exception as exc:  # noqa: BLE001 — surfaced via `errors`, not swallowed
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i,)) for i in (1, 2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert errors == []
    lines = _read_lines(path)  # raises if any line isn't valid JSON
    assert sorted(r["id"] for r in lines) == [1, 2]  # neither append lost the other's
