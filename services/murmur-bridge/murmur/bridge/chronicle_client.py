import logging
import pathlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

TIMEOUT_S = 30

# last_error is rendered verbatim on the Hub (apps/hub/src/routes/Murmur.tsx),
# so nothing that could carry a credential may reach it: strip query strings and
# cap the length before the string leaves this module.
_QUERY = re.compile(r"\?\S*")


def sanitize_error(text) -> str:
    return _QUERY.sub("?…", str(text))[:200]


@dataclass(frozen=True)
class UploadResult:
    """Truthy on success, so `if client.upload_wav(p):` still reads naturally,
    while the caller can tell an expired/rejected credential (permanent, needs a
    human) from a timeout or a Chronicle restart (retry will fix it)."""

    ok: bool
    error: str | None = None
    auth_failed: bool = False

    def __bool__(self) -> bool:
        return self.ok


class ChronicleClient:
    def __init__(self, base_url: str, api_key: str):
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}"}

    def upload_wav(self, path: pathlib.Path, start_ms: int | None = None) -> UploadResult:
        # start_ms is the flash page's absolute_timestamp_ms for the first page in
        # the session — the real capture time. The transcription backend's upload
        # route takes it as `started_at` and uses it for the conversation's
        # created_at, so the canonical day file partitions by when the speaker
        # actually talked rather than by when the pendant happened to drain.
        params = {} if start_ms is None else {"started_at": start_ms / 1000.0}
        try:
            with open(path, "rb") as f:
                response = requests.post(
                    f"{self._base_url}/api/audio/upload",
                    headers=self._headers,
                    params=params,
                    files={"files": (path.name, f, "audio/wav")},
                    timeout=TIMEOUT_S,
                )
        except requests.RequestException as exc:
            logger.warning("chronicle upload_wav failed for %s", path, exc_info=True)
            return UploadResult(False, sanitize_error(f"chronicle unreachable: {type(exc).__name__}"))
        if response.status_code in (401, 403):
            logger.error(
                "chronicle rejected the bridge credential (HTTP %s) — uploads are wedged until "
                "a new chrn_ API key is installed; see your Chronicle deployment docs",
                response.status_code,
            )
            return UploadResult(False, f"chronicle auth rejected (HTTP {response.status_code})", auth_failed=True)
        if not (200 <= response.status_code < 300):
            return UploadResult(False, f"chronicle upload failed (HTTP {response.status_code})")
        return UploadResult(True)

    def latest_ingest_ts(self) -> int | None:
        try:
            response = requests.get(
                f"{self._base_url}/api/conversations",
                headers=self._headers,
                params={"limit": 1, "sort_by": "created_at", "sort_order": "desc"},
                timeout=TIMEOUT_S,
            )
        except requests.RequestException:
            logger.warning("chronicle latest_ingest_ts failed", exc_info=True)
            return None
        if not (200 <= response.status_code < 300):
            return None
        conversations = response.json().get("conversations") or []
        if not conversations:
            return None
        created_at = conversations[0].get("created_at")
        if not created_at:
            return None
        dt = datetime.fromisoformat(created_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
