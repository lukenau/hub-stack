import json
import os
import pathlib
import sys
import tempfile

import pytest

TMP = pathlib.Path(tempfile.mkdtemp())
(TMP / "token").write_text("secret-token-value\n")
(TMP / "status.json").write_text("")
(TMP / "commands.json").write_text('{"id": 1, "action": "murmur.drain_now"}\n')
os.environ["MURMUR_BRIDGE_TOKEN_FILE"] = str(TMP / "token")
os.environ["MURMUR_BRIDGE_STATUS"] = str(TMP / "status.json")
os.environ["MURMUR_COMMANDS"] = str(TMP / "commands.json")
os.environ.pop("MURMUR_BRIDGE_TOKEN", None)

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fastapi.testclient import TestClient  # noqa: E402
from app import app  # noqa: E402

client = TestClient(app)
SNAP = {"state": "recording", "battery_pct": 80, "queue_wavs": 0, "last_command_id": None, "heartbeat": "2026-09-02T10:00:00Z"}


def test_status_requires_token():
    assert client.post("/api/murmur/bridge/status", json=SNAP).status_code == 401
    assert client.post("/api/murmur/bridge/status", json=SNAP, headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_status_writes_the_snapshot_in_place():
    r = client.post("/api/murmur/bridge/status", json=SNAP, headers={"Authorization": "Bearer secret-token-value"})
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert json.loads((TMP / "status.json").read_text()) == SNAP
    smaller = {"state": "disconnected", "heartbeat": "2026-09-02T10:01:00Z"}
    client.post("/api/murmur/bridge/status", json=smaller, headers={"Authorization": "Bearer secret-token-value"})
    assert json.loads((TMP / "status.json").read_text()) == smaller  # truncated, no stale tail


def test_status_rejects_malformed_and_oversized():
    h = {"Authorization": "Bearer secret-token-value"}
    assert client.post("/api/murmur/bridge/status", content=b"not json", headers=h).status_code == 400
    assert client.post("/api/murmur/bridge/status", json=[1, 2], headers=h).status_code == 400
    assert client.post("/api/murmur/bridge/status", json={"state": "recording"}, headers=h).status_code == 400
    assert client.post("/api/murmur/bridge/status", json={"heartbeat": "x", "pad": "y" * 20_000}, headers=h).status_code == 413


def test_status_503_when_token_unprovisioned(monkeypatch):
    import app as mod
    monkeypatch.setattr(mod, "MURMUR_BRIDGE_TOKEN_FILE", TMP / "missing-token")
    assert client.post("/api/murmur/bridge/status", json=SNAP, headers={"Authorization": "Bearer anything"}).status_code == 503


def test_commands_returns_raw_jsonl():
    r = client.get("/api/murmur/bridge/commands")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert r.text == '{"id": 1, "action": "murmur.drain_now"}\n'


def test_commands_empty_when_file_absent(monkeypatch):
    import app as mod
    monkeypatch.setattr(mod, "MURMUR_COMMANDS", TMP / "nope.json")
    r = client.get("/api/murmur/bridge/commands")
    assert r.status_code == 200 and r.text == ""


def test_other_posts_still_405():
    assert client.post("/api/murmur/bridge/nope", json={}).status_code == 405
