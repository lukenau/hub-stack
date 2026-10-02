#!/usr/bin/env python3
"""
Murmur Chronicle -> Supermemory ETL + canonical transcripts (deterministic; no LLM).

Supermemory is a MIRROR of Chronicle, not an append-only archive. Each completed,
live conversation is represented by two linked documents in the 'hermes' container:
  - murmur-{id}-summary    : title, speakers, summary, detailed summary
  - murmur-{id}-transcript : title, speakers, speaker-tagged transcript

Edits in Chronicle (speaker identification, regenerated titles/summaries, a new
active transcript version) re-publish the affected documents; conversations
Chronicle has dropped or soft-deleted are deleted from Supermemory.

Also appends a speaker-tagged canonical day file per conversation:
{out_dir}/YYYY-MM-DD.md. Those files are the primary, forever store and stay
append-only — Supermemory is the rebuildable index.

Secrets: read from an env file (MURMUR_ENV_PATH, default /etc/murmur/etl.env) —
ADMIN_EMAIL/ADMIN_PASSWORD (Chronicle login) and SUPERMEMORY_API_KEY.
"""

import argparse
import fcntl
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple
from zoneinfo import ZoneInfo

import requests

SM_BASE = "https://api.supermemory.ai/v3"
CONTAINER_TAG = "hermes"
HTTP_TIMEOUT = 30
SM_TIMEOUT = 60

ENV_PATH = os.environ.get("MURMUR_ENV_PATH", "/etc/murmur/etl.env")
CHRONICLE_BASE = os.environ.get("CHRONICLE_BASE_URL", "http://127.0.0.1:8100")
STATE_PATH = os.environ.get("MURMUR_ETL_STATE", "/var/lib/murmur/etl-state.json")
OUT_DIR = os.environ.get("MURMUR_ETL_OUT_DIR", "/var/lib/murmur/transcripts")

LIST_LIMIT = 200
STATE_VERSION = 2

# Bump whenever the published document shape changes. It is part of the content
# hash, so changing the layout re-publishes every conversation on the next run
# instead of leaving old documents in the old shape until someone remembers to
# run --resync-all.
DOC_SHAPE_VERSION = 2

# One clock for the whole pipeline. The host-side derive script already buckets
# conversations_today and looks up the day file in Eastern; naming day files in
# UTC split every evening's capture across two files and made the Hub's Memory
# card contradict its own Pipeline card between 8 PM and midnight ET.
# Supermemory metadata keeps UTC.
TZ = ZoneInfo(os.environ.get("HUB_TZ", "America/New_York"))


# ---------- env ----------

def read_env(path):
    values = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return values


# ---------- state ----------

def load_state(state_path):
    """State schema v2:

    {"version": 2,
     "ids": [conversation_id, ...],          # sorted mirror of conversations' keys
     "conversations": {conversation_id: {"hash": str|None,
                                         "synced_at": iso|None,
                                         "docs": {customId: supermemory_document_id}}},
     "chronicle_total": int, "last_run": iso}

    `ids` is kept because the host-side watcher/derive scripts read it. v1 state
    (ids only) migrates in place: every legacy id gets a null hash, so its first
    v2 run re-publishes it from current Chronicle content — which is the point,
    those are exactly the documents frozen at ingest time."""
    try:
        with open(state_path) as f:
            state = json.load(f)
    except FileNotFoundError:
        state = {}
    state.setdefault("ids", [])
    conversations = state.setdefault("conversations", {})
    for conversation_id in state["ids"]:
        conversations.setdefault(conversation_id, {"hash": None, "synced_at": None, "docs": {}})
    state["version"] = STATE_VERSION
    return state


def save_state(state, state_path):
    state["ids"] = sorted(state.get("conversations") or {})
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    tmp = f"{state_path}.tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    os.replace(tmp, state_path)


# ---------- Chronicle ----------

def chronicle_login(base, email, password):
    r = requests.post(
        f"{base}/auth/jwt/login",
        data={"username": email, "password": password},
        timeout=HTTP_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def list_conversations(base, chron_token, offset=0, limit=LIST_LIMIT):
    r = requests.get(
        f"{base}/api/conversations",
        headers={"Authorization": f"Bearer {chron_token}"},
        params={"limit": limit, "offset": offset, "sort_by": "created_at", "sort_order": "desc"},
        timeout=HTTP_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def collect_live(base, chron_token):
    """Every conversation Chronicle still considers live, paged to exhaustion.

    A fixed newest-200 window meant any backlog longer than the window — an ETL
    outage of a week or two — was permanently and silently never ingested,
    because nothing ever queried below it again. Reading the whole list also
    makes it authoritative for deletion: absent from here == gone from Chronicle
    (the endpoint omits soft-deleted conversations unless include_deleted is set).

    Returns (items, total, rows); `total` is Chronicle's own count, recorded in
    the state file so murmur-watch.sh can compare it against how many ids we hold
    and make a silent hole visible. `rows` counts everything the listing returned
    including soft-deleted conversations — it is what separates "Chronicle
    answered, and these are gone" from "Chronicle told us nothing", which is the
    only thing standing between a bad hour and an erased memory store."""
    out, offset, total, rows = [], 0, None, 0
    while True:
        body = list_conversations(base, chron_token, offset)
        page = body.get("conversations") or []
        if total is None:
            total = body.get("total")
        if not page:
            break
        rows += len(page)
        out.extend(c for c in page if not c.get("deleted"))
        offset += len(page)
        if isinstance(total, int) and offset >= total:
            break
    return out, total, rows


def get_conversation_detail(base, chron_token, conversation_id):
    r = requests.get(
        f"{base}/api/conversations/{conversation_id}",
        headers={"Authorization": f"Bearer {chron_token}"},
        timeout=HTTP_TIMEOUT,
    )
    r.raise_for_status()
    return r.json().get("conversation") or {}


def parse_created_at(created_at):
    dt = datetime.fromisoformat(created_at)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def local_day(dt):
    """The ET-local instant a day file is named and headed by."""
    return dt.astimezone(TZ)


# ---------- change detection ----------

def speakers_of(item, detail=None):
    """Chronicle's own speaker set for the conversation. The list payload carries
    `speakers`; the detail payload does not, so fall back to the segments, where
    an identified speaker overrides the diarization label."""
    names = list(item.get("speakers") or [])
    if not names and detail:
        for s in detail.get("segments") or []:
            name = s.get("identified_as") or s.get("speaker")
            if name and name not in names:
                names.append(name)
    return names


def content_hash(item):
    """Everything that can change the published documents — Chronicle's content
    plus the shape this ETL renders it in. Computed from the LIST payload alone
    so an unchanged conversation costs no detail fetch and no Supermemory
    call."""
    material = [
        DOC_SHAPE_VERSION,
        item.get("title"),
        item.get("summary"),
        item.get("detailed_summary"),
        item.get("active_transcript_version"),
        item.get("processing_status"),
        item.get("segment_count"),
        sorted(speakers_of(item)),
    ]
    blob = json.dumps(material, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


# ---------- content builders ----------

def format_duration(seconds):
    if not seconds:
        return None
    total = int(round(float(seconds)))
    return f"{total // 60}m {total % 60}s"


def doc_heading(title, dt, doc_type):
    """The heading that decides the title Supermemory shows.

    /v3/documents has no title field — whatever is sent as `title` is ignored and
    the rendered title is generated from the content. So the heading is the only
    lever, and its shape matters: with the date leading, the generator writes
    "<topic> - <date>" and drops the type, which is how both documents for a
    conversation ended up with the same title and looked like a duplicate pair.
    Leading with the type keeps the type. `- Document:` below repeats it, and
    metadata.docType/metadata.title carry it deterministically for anything that
    filters rather than reads."""
    return f"{doc_type.capitalize()} — {title} ({local_day(dt).strftime('%Y-%m-%d')})"


def header_lines(title, dt, speakers, conversation_id, duration_seconds, doc_type):
    lines = [f"# {doc_heading(title, dt, doc_type)}", ""]
    lines.append(f"- Document: {doc_type.capitalize()} of the conversation “{title}”")
    lines.append(f"- Date: {local_day(dt).strftime('%Y-%m-%d %H:%M')} ET")
    duration = format_duration(duration_seconds)
    if duration:
        lines.append(f"- Duration: {duration}")
    lines.append(f"- Speakers: {', '.join(speakers) if speakers else 'unidentified'}")
    lines.append(f"- Conversation: {conversation_id}")
    return lines


def base_metadata(doc_type, conversation_id, title, dt, speakers, detail, digest):
    metadata = {
        "source": "murmur",
        "docType": doc_type,
        "conversationId": conversation_id,
        "meetingGroup": conversation_id,
        "title": doc_heading(title, dt, doc_type),
        "conversationTitle": title,
        "date": local_day(dt).strftime("%Y-%m-%d"),
        "startedAt": dt.isoformat(),
        "speakers": ", ".join(speakers),
        "speakerCount": len(speakers),
        "segmentCount": len(detail.get("segments") or []),
        "contentHash": digest,
    }
    version = detail.get("active_transcript_version")
    if version:
        metadata["transcriptVersion"] = version
    duration = detail.get("duration_seconds") or detail.get("audio_total_duration")
    if duration:
        metadata["durationSeconds"] = round(float(duration), 2)
    return metadata


def build_summary_doc(detail, title, conversation_id, dt, speakers, digest):
    lines = header_lines(title, dt, speakers, conversation_id, detail.get("duration_seconds"), "summary")
    summary = (detail.get("summary") or "").strip()
    detailed = (detail.get("detailed_summary") or "").strip()
    if summary:
        lines += ["", "## Summary", "", summary]
    if detailed and detailed != summary:
        lines += ["", "## Detailed summary", "", detailed]
    metadata = base_metadata("summary", conversation_id, title, dt, speakers, detail, digest)
    return "\n".join(lines), metadata


def transcript_lines(segments):
    lines = []
    for s in segments:
        text = (s.get("text") or "").strip()
        if not text:
            continue
        speaker = s.get("identified_as") or s.get("speaker") or "?"
        lines.append(f"{speaker}: {text}")
    return lines


def build_transcript_doc(detail, title, conversation_id, dt, speakers, digest):
    lines = header_lines(title, dt, speakers, conversation_id, detail.get("duration_seconds"), "transcript")
    summary = (detail.get("summary") or "").strip()
    if summary:
        lines += ["", "## Summary", "", summary]
    lines += ["", "## Transcript", ""]
    lines += transcript_lines(detail.get("segments") or [])
    metadata = base_metadata("transcript", conversation_id, title, dt, speakers, detail, digest)
    return "\n".join(lines), metadata


# ---------- Supermemory ----------

def sm_ingest(sm_key, content, custom_id, metadata, title):
    payload = {
        "content": content,
        "containerTag": CONTAINER_TAG,
        "customId": custom_id,
        "metadata": metadata,
        "title": title,
    }
    r = requests.post(
        f"{SM_BASE}/documents",
        headers={"Authorization": f"Bearer {sm_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=SM_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


DELETE_RETRIES = 5
DELETE_BACKOFF = 6


def sm_delete(sm_key, ref, sleep=time.sleep):
    """Delete by Supermemory document id (preferred) or customId — the route
    resolves both. 404 means it is already gone, which is success. 409 means the
    document is still being extracted; retry, because the caller's alternative is
    to re-POST over it, and a POST onto an existing customId APPENDS to the
    document instead of replacing it."""
    for attempt in range(DELETE_RETRIES):
        r = requests.delete(
            f"{SM_BASE}/documents/{ref}",
            headers={"Authorization": f"Bearer {sm_key}"},
            timeout=SM_TIMEOUT,
        )
        if r.status_code in (200, 204, 404):
            return True
        if r.status_code != 409:
            r.raise_for_status()
        if attempt < DELETE_RETRIES - 1:
            sleep(DELETE_BACKOFF)
    raise RuntimeError(f"Supermemory refused to delete {ref}: still processing after {DELETE_RETRIES} attempts")


def sm_publish(sm_key, custom_id, known_doc_id, content, metadata, title):
    """Replace whatever currently lives at `custom_id`.

    Delete-then-create, not re-POST: POSTing an existing customId appends the new
    content under a `---` rule and keeps the original derived title, so the stale
    text the owner complained about would survive every "update" forever. The
    delete runs even when we hold no document id — state can be behind the store
    (every pre-v2 entry is), and only a delete-first makes the outcome the same
    either way."""
    sm_delete(sm_key, known_doc_id or custom_id)
    return sm_ingest(sm_key, content, custom_id, metadata, title).get("id")


# ---------- canonical day file ----------

def append_day_file(out_dir, dt, title, segments, conversation_id):
    """Idempotent append to the canonical (forever) day file. The id marker is
    what makes it idempotent under EVERY interleaving: a crash between the append
    and the state write used to duplicate a whole transcript block permanently,
    with nothing to grep for and nothing to dedupe against. A re-sync is also an
    interleaving — the marker is why re-publishing a conversation never grows the
    day file."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    local = local_day(dt)
    day_path = out_dir / f"{local.strftime('%Y-%m-%d')}.md"
    marker = f"<!-- murmur:conv:{conversation_id} -->"
    if day_path.exists() and marker in day_path.read_text():
        return False
    lines = [marker, f"## {local.strftime('%H:%M')} — {title}"]
    lines.extend(transcript_lines(segments))
    lines.append("")
    with open(day_path, "a") as f:
        f.write("\n".join(lines) + "\n")
    return True


# ---------- sync ----------

class SyncResult(NamedTuple):
    new: int
    updated: int
    deleted: int
    failed: int


def sync(chronicle_base, chron_token, sm_key, state_path=STATE_PATH, out_dir=OUT_DIR,
         dry_run=False, resync_all=False, only=None, prune=True):
    state_path = str(state_path)
    state = load_state(state_path)
    tracked = state["conversations"]

    items, total, rows = collect_live(chronicle_base, chron_token)
    live_ids = {c.get("conversation_id") for c in items if c.get("conversation_id")}
    # Oldest first: day files are the canonical record, and a desc-sorted write
    # loop made them non-chronological by construction (newest-first within a
    # run, oldest-last across runs).
    items.sort(key=lambda c: c.get("created_at") or "")
    new_count = updated_count = deleted_count = failed_count = 0

    for item in items:
        conversation_id = item.get("conversation_id")
        if not conversation_id or (only and conversation_id != only):
            continue
        if item.get("processing_status") != "completed":
            continue

        entry = tracked.get(conversation_id)
        digest = content_hash(item)
        if entry and entry.get("hash") == digest and not resync_all:
            continue
        is_update = bool(entry)

        try:
            detail = get_conversation_detail(chronicle_base, chron_token, conversation_id)
            if detail.get("processing_status") != "completed":
                continue

            created_at = detail.get("created_at") or item.get("created_at")
            dt = parse_created_at(created_at)
            title = detail.get("title") or item.get("title") or f"Conversation {conversation_id}"
            segments = detail.get("segments") or []
            speakers = speakers_of(item, detail)

            summary_id = f"murmur-{conversation_id}-summary"
            transcript_id = f"murmur-{conversation_id}-transcript"
            summary_content, summary_meta = build_summary_doc(detail, title, conversation_id, dt, speakers, digest)
            transcript_content, transcript_meta = build_transcript_doc(detail, title, conversation_id, dt, speakers, digest)
            summary_title = doc_heading(title, dt, "summary")
            transcript_title = doc_heading(title, dt, "transcript")

            if dry_run:
                verb = "update" if is_update else "new"
                print(f"[{verb}] {conversation_id} · {title!r} ({local_day(dt).date()}) · speakers={speakers}")
                print(f"  -> summary: {len(summary_content)} chars · customId={summary_id}")
                print(f"  -> transcript: {len(transcript_content)} chars · customId={transcript_id} ({len(segments)} segments)")
                updated_count += is_update
                new_count += not is_update
                continue

            # Canonical day file FIRST. The spec makes the flat files primary and
            # forever, and Supermemory a rebuildable index — writing the index
            # first meant a Supermemory outage also stopped the primary store.
            append_day_file(out_dir, dt, title, segments, conversation_id)

            docs = dict((entry or {}).get("docs") or {})
            # Drop the hash before touching Supermemory: between the delete and
            # the create the document does not exist, and a crash in that window
            # must leave the conversation looking unsynced, not synced.
            tracked[conversation_id] = {"hash": None, "synced_at": (entry or {}).get("synced_at"), "docs": docs}
            save_state(state, state_path)

            docs[summary_id] = sm_publish(sm_key, summary_id, docs.get(summary_id),
                                          summary_content, summary_meta, summary_title)
            docs[transcript_id] = sm_publish(sm_key, transcript_id, docs.get(transcript_id),
                                             transcript_content, transcript_meta, transcript_title)

            tracked[conversation_id] = {
                "hash": digest,
                "synced_at": datetime.now(timezone.utc).isoformat(),
                "docs": docs,
            }
            save_state(state, state_path)
            updated_count += is_update
            new_count += not is_update
        except Exception as e:
            failed_count += 1
            print(f"WARNING: murmur ETL failed on conversation {conversation_id}: {e}", file=sys.stderr)
            continue

    # Deletion propagation, driven by the full live listing. A listing that
    # returned no rows at all is an API blip, not a mass deletion — refusing to
    # act on it is the difference between a missed hour and an erased memory
    # store. Rows that came back soft-deleted ARE a deletion signal.
    if prune and not only and rows:
        for conversation_id in sorted(set(tracked) - live_ids):
            entry = tracked[conversation_id]
            refs = dict(entry.get("docs") or {}) or {
                f"murmur-{conversation_id}-summary": None,
                f"murmur-{conversation_id}-transcript": None,
            }
            if dry_run:
                print(f"[delete] {conversation_id} · {len(refs)} document(s)")
                deleted_count += 1
                continue
            try:
                for custom_id, doc_id in refs.items():
                    # The 'hermes' container also holds the owner's OPS digests,
                    # cron output and other memories. Nothing this pass deletes
                    # may be addressed by anything but a murmur customId, or a
                    # document id this ETL got back from posting one.
                    if not custom_id.startswith("murmur-"):
                        continue
                    sm_delete(sm_key, doc_id or custom_id)
                del tracked[conversation_id]
                save_state(state, state_path)
                deleted_count += 1
            except Exception as e:
                failed_count += 1
                print(f"WARNING: murmur ETL failed to delete conversation {conversation_id}: {e}", file=sys.stderr)
    elif prune and not only and tracked:
        print("WARNING: Chronicle's conversation list came back empty — skipping deletion pass", file=sys.stderr)

    if not dry_run:
        if isinstance(total, int):
            state["chronicle_total"] = total
        save_state(state, state_path)

    return SyncResult(new_count, updated_count, deleted_count, failed_count)


def acquire_lock(state_path):
    """The cron fires hourly and a manual --resync-all can run alongside it. Two
    writers racing on the state file would resurrect deleted entries and, worse,
    interleave a delete from one run with a create from the other."""
    lock_path = f"{state_path}.lock"
    fh = open(lock_path, "w")
    try:
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        fh.close()
        return None
    return fh


def main():
    ap = argparse.ArgumentParser(description="Sync Murmur Chronicle conversations into Supermemory + canonical transcripts")
    ap.add_argument("--dry-run", action="store_true", help="show plan, no writes")
    ap.add_argument("--resync-all", action="store_true", help="re-publish every live conversation, ignoring stored hashes")
    ap.add_argument("--only", metavar="CONVERSATION_ID", help="restrict to one conversation (skips the deletion pass)")
    ap.add_argument("--no-prune", action="store_true", help="skip the deletion pass")
    args = ap.parse_args()

    env = read_env(ENV_PATH)
    admin_email = env.get("ADMIN_EMAIL")
    admin_password = env.get("ADMIN_PASSWORD")
    sm_key = env.get("SUPERMEMORY_API_KEY")
    if not admin_email or not admin_password:
        print("ERROR: ADMIN_EMAIL/ADMIN_PASSWORD not found in", ENV_PATH, file=sys.stderr)
        sys.exit(1)
    if not sm_key and not args.dry_run:
        print("ERROR: SUPERMEMORY_API_KEY not found in", ENV_PATH, file=sys.stderr)
        sys.exit(1)

    lock = acquire_lock(STATE_PATH) if not args.dry_run else True
    if lock is None:
        print("Murmur->Supermemory: another run holds the lock; exiting")
        return

    chron_token = chronicle_login(CHRONICLE_BASE, admin_email, admin_password)
    result = sync(CHRONICLE_BASE, chron_token, sm_key, dry_run=args.dry_run,
                  resync_all=args.resync_all, only=args.only, prune=not args.no_prune)

    tag = "DRY-RUN " if args.dry_run else ""
    print(f"{tag}Murmur->Supermemory: {result.new} new, {result.updated} updated, "
          f"{result.deleted} deleted, {result.failed} failed")
    # Per-item exceptions are caught so one bad conversation cannot stop the run,
    # but the process must still exit non-zero — that is the only thing the cron's
    # `|| logger -t murmur-etl "run FAILED"` guard can see. Without it a rotated
    # Supermemory key silently syncs nothing, for weeks.
    if result.failed:
        print(f"ERROR: {result.failed} conversation(s) failed to sync", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
