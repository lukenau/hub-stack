import json

import responses
from responses import matchers

from murmur.etl.murmur_to_supermemory import sync

CHRON = "http://127.0.0.1:8100"
SM = "https://api.supermemory.ai/v3"


def LIST_MATCH(offset=0):
    return matchers.query_param_matcher(
        {"limit": "200", "offset": str(offset), "sort_by": "created_at", "sort_order": "desc"}
    )


def sm_deletes_ok():
    """Every publish deletes before it creates — POSTing an existing customId
    appends instead of replacing."""
    responses.add(responses.DELETE, matchers.re.compile(rf"{SM}/documents/.+"), status=404)


CONV_LIST = {
    "conversations": [
        {
            "conversation_id": "abc",
            "title": "Coffee with Guest",
            "created_at": "2025-09-01T04:13:20+00:00",
            "processing_status": "completed",
            "summary": "Talked about the trip.",
            "detailed_summary": "A long walk through the itinerary.",
            "speakers": ["Owner (ME)", "Guest"],
            "active_transcript_version": "v1",
            "segment_count": 1,
        }
    ],
    "total": 1,
    "limit": 200,
    "offset": 0,
}

CONV_DETAIL = {
    "conversation": {
        "conversation_id": "abc",
        "title": "Coffee with Guest",
        "created_at": "2025-09-01T04:13:20+00:00",
        "processing_status": "completed",
        "summary": "Talked about the trip.",
        "detailed_summary": "A long walk through the itinerary.",
        "active_transcript_version": "v1",
        "duration_seconds": 65.0,
        "transcript": "hi",
        "segments": [{"speaker": "Owner", "identified_as": "Owner (ME)", "text": "hi", "start": 0.0, "end": 1.0}],
    }
}


def _mock_list_and_detail(conv_list=None, detail=None):
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=conv_list or CONV_LIST,
                  status=200, match=[LIST_MATCH()])
    responses.add(responses.GET, f"{CHRON}/api/conversations/abc", json=detail or CONV_DETAIL, status=200)


def _doc_bodies():
    return [json.loads(c.request.body) for c in responses.calls
            if c.request.method == "POST" and "/documents" in c.request.url]


@responses.activate
def test_sync_pushes_docs_and_writes_canonical(tmp_path):
    _mock_list_and_detail()
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)

    result = sync(CHRON, "ctok", "smkey", state_path=tmp_path / "s.json", out_dir=tmp_path)

    assert result == (1, 0, 0, 0)
    day = next(tmp_path.glob("*.md")).read_text()
    assert "Coffee with Guest" in day and "Owner (ME): hi" in day

    list_call = responses.calls[0].request
    assert list_call.headers["Authorization"] == "Bearer ctok"

    detail_call = next(c for c in responses.calls if "/api/conversations/abc" in c.request.url)
    assert detail_call.request.headers["Authorization"] == "Bearer ctok"

    bodies = _doc_bodies()
    assert len(bodies) == 2
    assert {b["customId"] for b in bodies} == {"murmur-abc-summary", "murmur-abc-transcript"}
    assert all(b["containerTag"] == "hermes" for b in bodies)
    # Both documents used to carry the identical title, so a conversation looked
    # like a duplicate pair in the Supermemory list with no way to tell them apart.
    assert {b["title"] for b in bodies} == {"Summary — Coffee with Guest (2025-09-01)",
                                            "Transcript — Coffee with Guest (2025-09-01)"}
    # /v3/documents has no title field: the rendered title is generated from the
    # content, and only a type-leading heading keeps the type in it.
    assert all(b["content"].splitlines()[0] == f"# {b['title']}" for b in bodies)
    assert {b["metadata"]["docType"] for b in bodies} == {"summary", "transcript"}
    assert all(b["metadata"]["title"] == b["title"] for b in bodies)
    assert all(b["metadata"]["conversationTitle"] == "Coffee with Guest" for b in bodies)


@responses.activate
def test_summary_doc_carries_every_component(tmp_path):
    # The owner's ask: title, summary, detailed summary, speakers — all of it, in
    # the document, not just a title and whichever summary happened to be set.
    _mock_list_and_detail()
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)

    sync(CHRON, "ctok", "smkey", state_path=tmp_path / "s.json", out_dir=tmp_path)

    summary = next(b for b in _doc_bodies() if b["customId"].endswith("-summary"))
    assert summary["content"].startswith("# Summary — Coffee with Guest (2025-09-01)")
    assert "- Speakers: Owner (ME), Guest" in summary["content"]
    assert "Talked about the trip." in summary["content"]
    assert "A long walk through the itinerary." in summary["content"]
    assert summary["metadata"]["speakers"] == "Owner (ME), Guest"
    assert summary["metadata"]["speakerCount"] == 2
    assert summary["metadata"]["transcriptVersion"] == "v1"
    assert summary["metadata"]["contentHash"]

    transcript = next(b for b in _doc_bodies() if b["customId"].endswith("-transcript"))
    assert "- Speakers: Owner (ME), Guest" in transcript["content"]
    assert "Owner (ME): hi" in transcript["content"]


@responses.activate
def test_sync_idempotent(tmp_path):
    _mock_list_and_detail()
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)
    sync(CHRON, "ctok", "smkey", state_path=tmp_path / "s.json", out_dir=tmp_path)

    responses.add(responses.GET, f"{CHRON}/api/conversations", json=CONV_LIST, status=200, match=[LIST_MATCH()])

    assert sync(CHRON, "ctok", "smkey", state_path=tmp_path / "s.json", out_dir=tmp_path) == (0, 0, 0, 0)
    assert len(_doc_bodies()) == 2  # no new POSTs on the second run
    # ...and no detail fetch either: an unchanged conversation costs one list page.
    assert len([c for c in responses.calls if "/api/conversations/abc" in c.request.url]) == 1


@responses.activate
def test_edited_conversation_is_republished(tmp_path):
    # The bug this rewrite exists for: a conversation synced before speaker
    # identification ran was frozen with "Speaker 0 discusses..." forever.
    stale_list = json.loads(json.dumps(CONV_LIST))
    stale_list["conversations"][0].update(
        {"summary": "Speaker 0 discusses a trip.", "speakers": ["Speaker 0", "Speaker 1"]}
    )
    stale_detail = json.loads(json.dumps(CONV_DETAIL))
    stale_detail["conversation"]["summary"] = "Speaker 0 discusses a trip."
    _mock_list_and_detail(stale_list, stale_detail)
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "doc-1"}, status=200)

    state_path = tmp_path / "s.json"
    sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path)
    assert json.loads(state_path.read_text())["conversations"]["abc"]["docs"] == {
        "murmur-abc-summary": "doc-1",
        "murmur-abc-transcript": "doc-1",
    }

    # Chronicle now has real names and a regenerated summary.
    _mock_list_and_detail()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "doc-2"}, status=200)

    result = sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path)

    assert result == (0, 1, 0, 0)
    summary = [b for b in _doc_bodies() if b["customId"].endswith("-summary")][-1]
    assert "Speaker 0" not in summary["content"]
    assert "Owner (ME), Guest" in summary["content"]
    # The stale document is deleted by its stored id before the new one is
    # created — a bare re-POST would have appended under it.
    deletes = [c.request.url for c in responses.calls if c.request.method == "DELETE"]
    assert f"{SM}/documents/doc-1" in deletes
    assert json.loads(state_path.read_text())["conversations"]["abc"]["docs"]["murmur-abc-summary"] == "doc-2"


@responses.activate
def test_day_file_is_not_regrown_by_a_resync(tmp_path):
    _mock_list_and_detail()
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)
    state_path = tmp_path / "s.json"
    sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path)
    first = next(tmp_path.glob("*.md")).read_text()

    _mock_list_and_detail()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)
    sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path, resync_all=True)

    assert next(tmp_path.glob("*.md")).read_text() == first


@responses.activate
def test_resync_all_republishes_unchanged_conversations(tmp_path):
    _mock_list_and_detail()
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)
    state_path = tmp_path / "s.json"
    sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path)

    _mock_list_and_detail()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)

    assert sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path,
                resync_all=True) == (0, 1, 0, 0)
    assert len(_doc_bodies()) == 4


@responses.activate
def test_conversation_gone_from_chronicle_is_deleted_from_supermemory(tmp_path):
    state_path = tmp_path / "s.json"
    state_path.write_text(json.dumps({
        "version": 2,
        "ids": ["abc", "dropped"],
        "conversations": {
            "abc": {"hash": None, "synced_at": None, "docs": {}},
            "dropped": {"hash": "h", "synced_at": None,
                        "docs": {"murmur-dropped-summary": "d1", "murmur-dropped-transcript": "d2"}},
        },
    }))
    _mock_list_and_detail()
    sm_deletes_ok()
    responses.add(responses.DELETE, f"{SM}/documents/d1", status=204)
    responses.add(responses.DELETE, f"{SM}/documents/d2", status=204)
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)

    result = sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path)

    assert result == (0, 1, 1, 0)
    deletes = [c.request.url for c in responses.calls if c.request.method == "DELETE"]
    assert f"{SM}/documents/d1" in deletes and f"{SM}/documents/d2" in deletes
    state = json.loads(state_path.read_text())
    assert "dropped" not in state["conversations"]
    assert state["ids"] == ["abc"]


@responses.activate
def test_soft_deleted_conversation_in_the_list_is_treated_as_gone(tmp_path):
    listing = {"conversations": [{**CONV_LIST["conversations"][0], "deleted": True,
                                  "deletion_reason": "duplicate upload"}],
               "total": 1, "limit": 200, "offset": 0}
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=listing, status=200, match=[LIST_MATCH()])
    responses.add(responses.DELETE, f"{SM}/documents/s1", status=204)
    responses.add(responses.DELETE, f"{SM}/documents/t1", status=204)
    state_path = tmp_path / "s.json"
    state_path.write_text(json.dumps({
        "version": 2, "ids": ["abc"],
        "conversations": {"abc": {"hash": "h", "synced_at": None,
                                  "docs": {"murmur-abc-summary": "s1", "murmur-abc-transcript": "t1"}}},
    }))

    assert sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path) == (0, 0, 1, 0)
    assert json.loads(state_path.read_text())["conversations"] == {}


@responses.activate
def test_empty_chronicle_list_never_purges(tmp_path):
    # An API blip that returns nothing must cost a missed hour, not the store.
    responses.add(responses.GET, f"{CHRON}/api/conversations",
                  json={"conversations": [], "total": 0, "limit": 200, "offset": 0},
                  status=200, match=[LIST_MATCH()])
    state_path = tmp_path / "s.json"
    state_path.write_text(json.dumps({
        "version": 2, "ids": ["abc"],
        "conversations": {"abc": {"hash": "h", "synced_at": None,
                                  "docs": {"murmur-abc-summary": "s1"}}},
    }))

    assert sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path) == (0, 0, 0, 0)
    assert not [c for c in responses.calls if c.request.method == "DELETE"]
    assert json.loads(state_path.read_text())["ids"] == ["abc"]


@responses.activate
def test_legacy_state_migrates_and_republishes(tmp_path):
    # v1 state has ids and no hashes; those are exactly the frozen documents.
    state_path = tmp_path / "s.json"
    state_path.write_text(json.dumps({"ids": ["abc"], "last_run": None}))
    _mock_list_and_detail()
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)

    assert sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path) == (0, 1, 0, 0)
    state = json.loads(state_path.read_text())
    assert state["version"] == 2
    assert state["conversations"]["abc"]["hash"]
    # No stored document id — the publish still deletes by customId first, so a
    # pre-v2 document cannot be appended to.
    deletes = [c.request.url for c in responses.calls if c.request.method == "DELETE"]
    assert f"{SM}/documents/murmur-abc-summary" in deletes


@responses.activate
def test_sync_skips_incomplete_conversation(tmp_path):
    pending_list = {
        "conversations": [{**CONV_LIST["conversations"][0], "processing_status": "active"}],
        "total": 1,
        "limit": 200,
        "offset": 0,
    }
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=pending_list, status=200, match=[LIST_MATCH()])

    result = sync(CHRON, "ctok", "smkey", state_path=tmp_path / "s.json", out_dir=tmp_path)

    assert result == (0, 0, 0, 0)
    assert not list(tmp_path.glob("*.md"))
    assert not any("/documents" in c.request.url for c in responses.calls)


@responses.activate
def test_sync_appends_not_overwrites_day_file(tmp_path):
    _mock_list_and_detail()
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)
    day_file = tmp_path / "2025-09-01.md"
    day_file.write_text("# existing content\n")

    sync(CHRON, "ctok", "smkey", state_path=tmp_path / "s.json", out_dir=tmp_path)

    text = day_file.read_text()
    assert "# existing content" in text
    assert "Coffee with Guest" in text


def _list_item(cid, title, created_at):
    return {
        "conversation_id": cid,
        "title": title,
        "created_at": created_at,
        "processing_status": "completed",
        "summary": f"summary-{cid}",
        "speakers": ["Owner"],
        "active_transcript_version": "v1",
        "segment_count": 1,
    }


def _detail(cid, title, created_at, text):
    return {
        "conversation": {
            "conversation_id": cid,
            "title": title,
            "created_at": created_at,
            "processing_status": "completed",
            "summary": f"summary-{cid}",
            "active_transcript_version": "v1",
            "transcript": text,
            "segments": [{"speaker": "Owner", "text": text, "start": 0.0, "end": 1.0}],
        }
    }


@responses.activate
def test_sync_persists_state_per_conversation_and_survives_sm_failure(tmp_path):
    conv_list = {
        "conversations": [
            _list_item("c1", "Standup", "2025-09-01T09:00:00+00:00"),
            _list_item("c2", "Retro", "2025-09-01T10:00:00+00:00"),
            _list_item("c3", "1:1", "2025-09-01T11:00:00+00:00"),
        ],
        "total": 3,
        "limit": 200,
        "offset": 0,
    }
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=conv_list, status=200, match=[LIST_MATCH()])
    for cid, title, hour, text in [("c1", "Standup", "09", "one"), ("c2", "Retro", "10", "two"),
                                   ("c3", "1:1", "11", "three")]:
        responses.add(responses.GET, f"{CHRON}/api/conversations/{cid}",
                      json=_detail(cid, title, f"2025-09-01T{hour}:00:00+00:00", text), status=200)
    sm_deletes_ok()

    responses.add(responses.POST, f"{SM}/documents", json={"id": "s1"}, status=200)  # c1 summary
    responses.add(responses.POST, f"{SM}/documents", json={"id": "t1"}, status=200)  # c1 transcript
    responses.add(responses.POST, f"{SM}/documents", json={"error": "boom"}, status=500)  # c2 summary -> raises
    responses.add(responses.POST, f"{SM}/documents", json={"id": "s3"}, status=200)  # c3 summary
    responses.add(responses.POST, f"{SM}/documents", json={"id": "t3"}, status=200)  # c3 transcript

    state_path = tmp_path / "s.json"
    result = sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path)

    assert result.new == 2 and result.failed == 1
    state = json.loads(state_path.read_text())
    # c2 is tracked but hash-less: its documents are mid-flight, so the next run
    # must re-publish it rather than treat it as synced.
    assert sorted(state["ids"]) == ["c1", "c2", "c3"]
    assert state["conversations"]["c2"]["hash"] is None
    assert state["conversations"]["c1"]["hash"] and state["conversations"]["c3"]["hash"]

    day_file = next(tmp_path.glob("*.md"))
    # ET headings (09:00Z = 05:00 ET) and an id marker per block, written oldest
    # first so the canonical file is chronological.
    block_c1 = "<!-- murmur:conv:c1 -->\n## 05:00 — Standup\nOwner: one\n\n"
    block_c2 = "<!-- murmur:conv:c2 -->\n## 06:00 — Retro\nOwner: two\n\n"
    block_c3 = "<!-- murmur:conv:c3 -->\n## 07:00 — 1:1\nOwner: three\n\n"
    assert day_file.read_text() == block_c1 + block_c2 + block_c3

    # second run: c2's SM posts now succeed. c1/c3 are unchanged — must not be
    # re-fetched (detail) or re-posted, and no day-file block is duplicated.
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=conv_list, status=200, match=[LIST_MATCH()])
    responses.add(responses.GET, f"{CHRON}/api/conversations/c2",
                  json=_detail("c2", "Retro", "2025-09-01T10:00:00+00:00", "two"), status=200)
    responses.add(responses.POST, f"{SM}/documents", json={"id": "s2"}, status=200)
    responses.add(responses.POST, f"{SM}/documents", json={"id": "t2"}, status=200)

    result2 = sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path)

    assert result2 == (0, 1, 0, 0)
    state2 = json.loads(state_path.read_text())
    assert sorted(state2["ids"]) == ["c1", "c2", "c3"]
    assert state2["conversations"]["c2"]["hash"]
    assert day_file.read_text() == block_c1 + block_c2 + block_c3

    assert len([c for c in responses.calls if "/api/conversations/c1" in c.request.url]) == 1
    assert len([c for c in responses.calls if "/api/conversations/c3" in c.request.url]) == 1


@responses.activate
def test_evening_conversation_lands_in_the_eastern_day_file(tmp_path):
    # F14/F24: 2025-09-02T01:00Z is 2025-09-01 21:00 ET. Naming the day file in
    # UTC put it in tomorrow's file, which the day-file consumer (Eastern) then read
    # as an empty ETL every evening.
    late = {
        "conversations": [{**CONV_LIST["conversations"][0], "created_at": "2025-09-02T01:00:00+00:00"}],
        "total": 1, "limit": 200, "offset": 0,
    }
    detail = {"conversation": {**CONV_DETAIL["conversation"], "created_at": "2025-09-02T01:00:00+00:00"}}
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=late, status=200, match=[LIST_MATCH()])
    responses.add(responses.GET, f"{CHRON}/api/conversations/abc", json=detail, status=200)
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)

    sync(CHRON, "ctok", "smkey", state_path=tmp_path / "s.json", out_dir=tmp_path)

    assert (tmp_path / "2025-09-01.md").exists()
    assert not (tmp_path / "2025-09-02.md").exists()
    assert "## 21:00 — " in (tmp_path / "2025-09-01.md").read_text()


@responses.activate
def test_day_file_append_is_idempotent_when_state_write_is_lost(tmp_path):
    # F19: a crash between the append and save_state() used to duplicate the
    # whole transcript block, permanently, in the designated forever store.
    _mock_list_and_detail()
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)
    sync(CHRON, "ctok", "smkey", state_path=tmp_path / "s.json", out_dir=tmp_path)
    first = next(tmp_path.glob("*.md")).read_text()

    (tmp_path / "s.json").unlink()  # state lost; the conversation looks unseen again
    _mock_list_and_detail()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)
    sync(CHRON, "ctok", "smkey", state_path=tmp_path / "s.json", out_dir=tmp_path)

    assert next(tmp_path.glob("*.md")).read_text() == first


@responses.activate
def test_backlog_below_the_first_page_is_still_ingested(tmp_path):
    # F16: a fixed newest-200 window meant anything older than the window was
    # never queried again — a silent, permanent hole after any ETL outage.
    page1 = {"conversations": [_list_item(f"c{i}", f"Conv {i}", f"2025-09-01T{i:02d}:00:00+00:00")
                               for i in range(10, 12)], "total": 4, "limit": 200, "offset": 0}
    page2 = {"conversations": [_list_item(f"c{i}", f"Conv {i}", f"2025-09-01T{i:02d}:00:00+00:00")
                               for i in range(12, 14)], "total": 4, "limit": 200, "offset": 2}
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=page1, status=200, match=[LIST_MATCH(0)])
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=page2, status=200, match=[LIST_MATCH(2)])
    for i in range(10, 14):
        responses.add(responses.GET, f"{CHRON}/api/conversations/c{i}",
                      json=_detail(f"c{i}", f"Conv {i}", f"2025-09-01T{i:02d}:00:00+00:00", f"text{i}"), status=200)
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)

    state_path = tmp_path / "s.json"
    result = sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path)

    assert result.new == 4
    state = json.loads(state_path.read_text())
    assert sorted(state["ids"]) == ["c10", "c11", "c12", "c13"]
    assert state["chronicle_total"] == 4


@responses.activate
def test_backdated_upload_is_not_stepped_over(tmp_path):
    # A relayed upload carries its real capture time, so a NEW conversation can
    # sort below already-synced ones. Reading the whole live list is what makes
    # that impossible to miss.
    seen_page = {"conversations": [_list_item("old1", "Old", "2025-09-01T12:00:00+00:00")],
                 "total": 2, "limit": 200, "offset": 0}
    buried = {"conversations": [_list_item("backdated", "Backdated", "2025-09-01T09:00:00+00:00")],
              "total": 2, "limit": 200, "offset": 1}
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=seen_page, status=200, match=[LIST_MATCH(0)])
    responses.add(responses.GET, f"{CHRON}/api/conversations", json=buried, status=200, match=[LIST_MATCH(1)])
    responses.add(responses.GET, f"{CHRON}/api/conversations/old1",
                  json=_detail("old1", "Old", "2025-09-01T12:00:00+00:00", "old"), status=200)
    responses.add(responses.GET, f"{CHRON}/api/conversations/backdated",
                  json=_detail("backdated", "Backdated", "2025-09-01T09:00:00+00:00", "buried"), status=200)
    sm_deletes_ok()
    responses.add(responses.POST, f"{SM}/documents", json={"id": "x"}, status=200)

    state_path = tmp_path / "s.json"
    sync(CHRON, "ctok", "smkey", state_path=state_path, out_dir=tmp_path)

    assert "backdated" in json.loads(state_path.read_text())["ids"]
