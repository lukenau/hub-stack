import requests
import responses
from responses import matchers

from murmur.bridge.chronicle_client import ChronicleClient, sanitize_error

BASE = "http://127.0.0.1:8100"


@responses.activate
def test_upload_ok(tmp_path):
    responses.add(responses.POST, f"{BASE}/api/audio/upload", json={"summary": {"started": 1}}, status=200)
    p = tmp_path / "a.wav"; p.write_bytes(b"RIFF")
    result = ChronicleClient(BASE, "chrn_abc_def").upload_wav(p)
    assert bool(result) is True and result.auth_failed is False and result.error is None
    sent = responses.calls[0].request
    assert sent.headers["Authorization"] == "Bearer chrn_abc_def"
    assert b'name="files"' in sent.body


@responses.activate
def test_upload_passes_capture_time_as_started_at(tmp_path):
    # F17: the real capture time reaches Chronicle as a query param, so the
    # conversation's created_at is when the speaker spoke, not when the pendant drained.
    responses.add(
        responses.POST,
        f"{BASE}/api/audio/upload",
        json={"summary": {"started": 1}},
        status=200,
        match=[matchers.query_param_matcher({"started_at": "1756700000.0"})],
    )
    p = tmp_path / "a.wav"; p.write_bytes(b"RIFF")
    assert bool(ChronicleClient(BASE, "tok").upload_wav(p, 1_756_700_000_000)) is True


@responses.activate
def test_upload_failure_returns_transient_result(tmp_path):
    responses.add(responses.POST, f"{BASE}/api/audio/upload", status=503)
    p = tmp_path / "a.wav"; p.write_bytes(b"RIFF")
    result = ChronicleClient(BASE, "tok").upload_wav(p)
    assert bool(result) is False and result.auth_failed is False
    assert "503" in result.error


@responses.activate
def test_upload_auth_failure_is_distinguishable(tmp_path):
    # F1/F8: an expired or revoked credential is permanent and needs a human —
    # it must not read as the same transient blip as a timeout.
    for status in (401, 403):
        responses.reset()
        responses.add(responses.POST, f"{BASE}/api/audio/upload", status=status)
        p = tmp_path / "a.wav"; p.write_bytes(b"RIFF")
        result = ChronicleClient(BASE, "tok").upload_wav(p)
        assert bool(result) is False
        assert result.auth_failed is True
        assert "auth rejected" in result.error


@responses.activate
def test_upload_connection_refused_is_transient(tmp_path):
    responses.add(responses.POST, f"{BASE}/api/audio/upload", body=requests.exceptions.ConnectionError())
    p = tmp_path / "a.wav"; p.write_bytes(b"RIFF")
    result = ChronicleClient(BASE, "tok").upload_wav(p)
    assert bool(result) is False and result.auth_failed is False
    assert "unreachable" in result.error


def test_sanitize_error_strips_query_strings():
    # last_error is rendered verbatim on the Hub — a URL query must never survive.
    assert "token=" not in sanitize_error("failed for http://x/api?token=secret123")


@responses.activate
def test_latest_ingest_ts():
    responses.add(
        responses.GET,
        f"{BASE}/api/conversations",
        json={
            "conversations": [{"created_at": "2025-09-01T04:13:20+00:00"}],
            "total": 1,
            "limit": 1,
            "offset": 0,
        },
        status=200,
        match=[matchers.query_param_matcher({"limit": "1", "sort_by": "created_at", "sort_order": "desc"})],
    )
    assert ChronicleClient(BASE, "tok").latest_ingest_ts() == 1756700000
    assert responses.calls[0].request.headers["Authorization"] == "Bearer tok"
