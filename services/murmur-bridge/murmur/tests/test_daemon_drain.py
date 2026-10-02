import asyncio, sys, pathlib, threading, time
sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "bridge" / "gen"))
import server_pb2, flash_page_pb2
from murmur.tests.test_audio import _page, _opus_frame   # reuse builders
from murmur.bridge.chronicle_client import UploadResult
from murmur.bridge.daemon import DrainStateMachine, _consume, _SENTINEL
from murmur.bridge.framing import Reassembler, encode_frames

class FakeClient:
    def __init__(self, ok=True): self.ok = ok; self.uploaded = []
    def upload_wav(self, p, start_ms=None): self.uploaded.append((p, start_ms)); return UploadResult(self.ok)

class SequencedClient:
    def __init__(self, results): self._results = list(results); self.calls = []
    def upload_wav(self, p, start_ms=None):
        self.calls.append(p); return UploadResult(self._results.pop(0))

def _storage_buffer(index, page_bytes, session=0, run=0):
    m = server_pb2.PendantAllMsg()
    m.storage_buffer.index = index
    m.storage_buffer.session = session
    m.storage_buffer.run = run
    m.storage_buffer.flash_page = page_bytes
    return m.SerializeToString()

def _decode_ack(frames):
    acked = server_pb2.ServerCommandMsg()
    r = Reassembler(); [r.feed(f) for f in frames[:-1]]; acked.ParseFromString(r.feed(frames[-1]))
    return acked.delete_flash_page.older_than_or_equal_to_index

def test_ack_only_after_successful_upload(tmp_path):
    sm = DrainStateMachine(tmp_path, FakeClient(ok=True), session_gap_ms=1)
    out1 = sm.on_payload(_storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()])))
    assert out1 == []                                  # session still open, no ACK yet
    out2 = sm.on_payload(_storage_buffer(2, _page(1_756_700_400_000, [_opus_frame()])))
    # big time gap closed session 1 -> uploaded -> ACK up_to_index=1 emitted
    assert _decode_ack(out2[0]) == 1

def test_no_ack_when_upload_fails(tmp_path):
    sm = DrainStateMachine(tmp_path, FakeClient(ok=False), session_gap_ms=1)
    sm.on_payload(_storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()])))
    out = sm.on_payload(_storage_buffer(2, _page(1_756_700_400_000, [_opus_frame()])))
    assert out == []                                   # keep pages on pendant

def test_diagnostic_page_acked_immediately(tmp_path):
    sm = DrainStateMachine(tmp_path, FakeClient(), session_gap_ms=1)
    p = flash_page_pb2.FlashPage(); p.absolute_timestamp_ms = 1_756_700_000_000
    out = sm.on_payload(_storage_buffer(7, p.SerializeToString()))
    assert len(out) == 1                               # ACK frames for index 7 (nothing else pending)

def test_diagnostic_page_blocked_by_open_session_then_acks_after_close(tmp_path):
    # trace (a): diagnostic idx 12 while open session holds un-uploaded {10,11} -> NO ack;
    # after that session uploads -> ack 12
    sm = DrainStateMachine(tmp_path, FakeClient(ok=True), session_gap_ms=1_000)
    sm.on_payload(_storage_buffer(10, _page(1_756_700_000_000, [_opus_frame()])))
    sm.on_payload(_storage_buffer(11, _page(1_756_700_000_500, [_opus_frame()])))
    p = flash_page_pb2.FlashPage(); p.absolute_timestamp_ms = 1_756_700_000_600
    out_diag = sm.on_payload(_storage_buffer(12, p.SerializeToString()))
    assert out_diag == []                              # 10, 11 still pending below idx 12
    out_roll = sm.on_payload(_storage_buffer(13, _page(1_756_700_400_000, [_opus_frame()])))
    assert _decode_ack(out_roll[0]) == 12               # session closes, uploads -> watermark jumps to 12

def test_watermark_caps_below_still_stuck_session(tmp_path):
    # trace (b): session A {1,2,3} fails, session B {4,5,6} succeeds -> no ack (min(U)=1);
    # next roll retries A (succeeds) but that roll's own session C {7} fails -> ack caps at 6
    client = SequencedClient([False, False, True, True, False])
    sm = DrainStateMachine(tmp_path, client, session_gap_ms=10_000)
    T = 1_756_700_000_000
    sm.on_payload(_storage_buffer(1, _page(T, [_opus_frame()])))
    sm.on_payload(_storage_buffer(2, _page(T + 100, [_opus_frame()])))
    sm.on_payload(_storage_buffer(3, _page(T + 200, [_opus_frame()])))
    out1 = sm.on_payload(_storage_buffer(4, _page(T + 500_000, [_opus_frame()])))   # closes A, own fails
    assert out1 == []
    sm.on_payload(_storage_buffer(5, _page(T + 500_100, [_opus_frame()])))
    sm.on_payload(_storage_buffer(6, _page(T + 500_200, [_opus_frame()])))
    out2 = sm.on_payload(_storage_buffer(7, _page(T + 1_000_000, [_opus_frame()])))  # closes B: retry A fails, own B succeeds
    assert out2 == []                                   # min(U)=1, nothing resolved below it yet
    out3 = sm.on_payload(_storage_buffer(8, _page(T + 1_500_000, [_opus_frame()])))  # closes C: retry A succeeds, own C fails
    assert _decode_ack(out3[0]) == 6                     # 7 still stuck pending -> watermark caps at 6
    assert len(client.calls) == 5

def test_retry_succeeds_on_next_roll_acks_through_current_session(tmp_path):
    client = SequencedClient([False, True, True])
    sm = DrainStateMachine(tmp_path, client, session_gap_ms=1)
    sm.on_payload(_storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()])))
    out1 = sm.on_payload(_storage_buffer(2, _page(1_756_700_400_000, [_opus_frame()])))  # closes {1}: own fails
    assert out1 == []
    out2 = sm.on_payload(_storage_buffer(3, _page(1_756_700_800_000, [_opus_frame()])))  # closes {2}: retry(1) + own(2) both succeed
    assert _decode_ack(out2[0]) == 2
    assert len(client.calls) == 3

def test_on_disconnect_clears_open_session_and_retry_queue(tmp_path):
    sm = DrainStateMachine(tmp_path, FakeClient(ok=False), session_gap_ms=1)
    sm.on_payload(_storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()])))
    sm.on_payload(_storage_buffer(2, _page(1_756_700_400_000, [_opus_frame()])))
    assert len(list(tmp_path.glob("*.wav"))) == 2        # session1 (failed -> retry queue) + session2 (open)

    sm.on_disconnect()
    assert list(tmp_path.glob("*.wav")) == []

def test_post_reconnect_redrain_produces_fresh_session(tmp_path):
    sm = DrainStateMachine(tmp_path, FakeClient(ok=True), session_gap_ms=1)
    payload = _storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()]))
    sm.on_payload(payload)
    assert len(list(tmp_path.glob("*.wav"))) == 1

    sm.on_disconnect()
    assert list(tmp_path.glob("*.wav")) == []

    out = sm.on_payload(payload)                         # pendant re-sends the un-acked page
    assert out == []
    wavs_after = list(tmp_path.glob("*.wav"))
    assert len(wavs_after) == 1 and wavs_after[0].exists()

def test_session_rolls_at_max_length_even_when_gap_is_small(tmp_path):
    sm = DrainStateMachine(tmp_path, FakeClient(ok=True), session_gap_ms=2_000_000)
    T = 1_756_700_000_000
    sm.on_payload(_storage_buffer(1, _page(T, [_opus_frame()])))
    sm.on_payload(_storage_buffer(2, _page(T + 1_000_000, [_opus_frame()])))         # gap 1_000_000 < cap, stays open
    out = sm.on_payload(_storage_buffer(3, _page(T + 1_900_000, [_opus_frame()])))   # gap 900_000 < cap, but length 1_900_000 > 30min
    assert out != []
    assert _decode_ack(out[0]) == 2

def test_wav_kept_on_failure_deleted_on_success(tmp_path):
    ok_dir, fail_dir = tmp_path / "ok", tmp_path / "fail"
    sm_ok = DrainStateMachine(ok_dir, FakeClient(ok=True), session_gap_ms=1)
    sm_ok.on_payload(_storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()])))
    sm_ok.on_payload(_storage_buffer(2, _page(1_756_700_400_000, [_opus_frame()])))
    assert list(ok_dir.glob("session1_*.wav")) == []     # deleted after successful upload

    sm_fail = DrainStateMachine(fail_dir, FakeClient(ok=False), session_gap_ms=1)
    sm_fail.on_payload(_storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()])))
    sm_fail.on_payload(_storage_buffer(2, _page(1_756_700_400_000, [_opus_frame()])))
    assert len(list(fail_dir.glob("session1_*.wav"))) == 1  # kept after failed upload

def test_consume_processes_queued_payloads_then_exits_on_sentinel(tmp_path):
    async def body():
        client = FakeClient(ok=True)
        sm = DrainStateMachine(tmp_path, client, session_gap_ms=1)
        queue: asyncio.Queue = asyncio.Queue()
        reasm = Reassembler()
        written = []

        async def write(fr):
            written.append(fr)

        for pkt in encode_frames(_storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()]))):
            queue.put_nowait(pkt)
        for pkt in encode_frames(_storage_buffer(2, _page(1_756_700_400_000, [_opus_frame()]))):
            queue.put_nowait(pkt)
        queue.put_nowait(_SENTINEL)

        await _consume(queue, reasm, sm, write, (OSError,))   # returns cleanly once it pops the sentinel
        return client, written

    client, written = asyncio.run(body())
    assert len(client.uploaded) == 1            # session for page 1 closed & uploaded once page 2 rolled it
    assert _decode_ack(written) == 1             # the resulting ACK reached the write callback

def test_teardown_joins_consumer_before_on_disconnect(tmp_path):
    gate = threading.Event()
    order: list[str] = []

    class SlowClient:
        def __init__(self): self.started = threading.Event()
        def upload_wav(self, p, start_ms=None):
            self.started.set()
            gate.wait(timeout=5)
            order.append("upload_finished")
            return UploadResult(True)

    async def body():
        client = SlowClient()
        sm = DrainStateMachine(tmp_path, client, session_gap_ms=1)
        queue: asyncio.Queue = asyncio.Queue()
        reasm = Reassembler()

        async def write(fr):
            pass

        for pkt in encode_frames(_storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()]))):
            queue.put_nowait(pkt)
        for pkt in encode_frames(_storage_buffer(2, _page(1_756_700_400_000, [_opus_frame()]))):
            queue.put_nowait(pkt)
        queue.put_nowait(_SENTINEL)

        consumer = asyncio.create_task(_consume(queue, reasm, sm, write, (OSError,)))

        async def teardown():
            await consumer                       # must not return before the in-flight upload_wav finishes
            sm.on_disconnect()
            order.append("on_disconnect_ran")

        teardown_task = asyncio.create_task(teardown())

        for _ in range(200):
            if client.started.is_set():
                break
            await asyncio.sleep(0.01)
        assert client.started.is_set()
        assert order == []                       # teardown is still blocked on the in-flight upload_wav call

        gate.set()
        await teardown_task

    asyncio.run(body())
    assert order == ["upload_finished", "on_disconnect_ran"]  # no orphaned upload, no premature reset


# --- final-review regressions ------------------------------------------------

class _Reporter:
    """Minimal StatusReporter stand-in — records what the daemon actually wires."""
    def __init__(self):
        self.state = "disconnected"
        self.uploads = []
        self.errors = []
        self.device_status = []
        self.battery = []
        self.last_upload_at = None
        self.last_error = None
    def on_upload(self, ok, error=None):
        self.uploads.append((ok, error))
        if ok:
            self.last_upload_at = "now"
        else:
            self.last_error = error
    def on_error(self, error):
        self.errors.append(error); self.last_error = error
    def on_device_status(self, msg):
        self.device_status.append(msg)
    def on_battery(self, msg):
        self.battery.append(msg)
    def on_disconnect(self):
        self.state = "disconnected"


def test_namespace_change_resets_watermark_and_still_acks(tmp_path):
    # F3: drain 1..3 under (session=1, run=1), then a factory reset restarts the
    # index at 1 under (session=2, run=1). The stale watermark must not suppress
    # the ACK — otherwise flash is never freed again for the life of the process.
    sm = DrainStateMachine(tmp_path, FakeClient(ok=True), session_gap_ms=1)
    T = 1_756_700_000_000
    sm.on_payload(_storage_buffer(1, _page(T, [_opus_frame()]), session=1, run=1))
    sm.on_payload(_storage_buffer(2, _page(T + 400_000, [_opus_frame()]), session=1, run=1))
    out = sm.on_payload(_storage_buffer(3, _page(T + 800_000, [_opus_frame()]), session=1, run=1))
    assert _decode_ack(out[0]) == 2

    sm.on_payload(_storage_buffer(1, _page(T, [_opus_frame()]), session=2, run=1))
    out_new = sm.on_payload(_storage_buffer(2, _page(T + 400_000, [_opus_frame()]), session=2, run=1))
    assert _decode_ack(out_new[0]) == 1


def test_namespace_change_flushes_open_session_and_retry_queue_client_fails(tmp_path):
    # Regression: a (session,run) namespace change must not silently unlink()
    # un-uploaded local audio via on_disconnect -- it must attempt a final
    # upload first, keeping (and surfacing) whatever still fails.
    reporter = _Reporter()
    client = SequencedClient([False, False, False])
    sm = DrainStateMachine(tmp_path, client, session_gap_ms=10_000, reporter=reporter)
    T = 1_756_700_000_000
    sm.on_payload(_storage_buffer(1, _page(T, [_opus_frame()]), session=1, run=1))
    out = sm.on_payload(_storage_buffer(2, _page(T + 500_000, [_opus_frame()]), session=1, run=1))
    assert out == []              # session1 closed -> upload failed -> retry queue
    # session2 (index 2) now open

    wavs_before = set(tmp_path.glob("*.wav"))
    assert len(wavs_before) == 2  # 1 retry-queue wav + 1 open-session wav

    p = flash_page_pb2.FlashPage(); p.absolute_timestamp_ms = T
    sm.on_payload(_storage_buffer(1, p.SerializeToString(), session=2, run=1))  # namespace change (no audio of its own)

    wavs_after = set(tmp_path.glob("*.wav"))
    assert wavs_after == wavs_before          # nothing unlinked -- both flush attempts failed
    assert len(client.calls) == 3             # 1 (initial close) + 2 (flush: open session + retry queue)
    assert any(not ok for ok, _err in reporter.uploads)  # failure surfaced to the reporter
    assert sm._namespace == (2, 1)
    assert sm._pending == set()
    assert sm._resolved == set()


def test_namespace_change_flushes_and_removes_wavs_when_upload_succeeds(tmp_path):
    reporter = _Reporter()
    client = SequencedClient([False, True, True])
    sm = DrainStateMachine(tmp_path, client, session_gap_ms=10_000, reporter=reporter)
    T = 1_756_700_000_000
    sm.on_payload(_storage_buffer(1, _page(T, [_opus_frame()]), session=1, run=1))
    sm.on_payload(_storage_buffer(2, _page(T + 500_000, [_opus_frame()]), session=1, run=1))
    # session1 closed -> upload failed -> retry queue; session2 (index 2) now open

    assert len(list(tmp_path.glob("*.wav"))) == 2

    p = flash_page_pb2.FlashPage(); p.absolute_timestamp_ms = T
    sm.on_payload(_storage_buffer(1, p.SerializeToString(), session=2, run=1))  # namespace change (no audio of its own)

    assert list(tmp_path.glob("*.wav")) == []  # both flush uploads succeeded -> unlinked
    assert len(client.calls) == 3
    assert reporter.uploads.count((True, None)) >= 2
    assert sm._namespace == (2, 1)
    assert sm._pending == set()
    assert sm._resolved == set()


def test_unreadable_audio_page_stays_pending_and_reports(tmp_path):
    # F5: a page whose audio sits in a codec field we do not decode must NOT be
    # resolved — resolving it ACK-deletes the only copy.
    reporter = _Reporter()
    sm = DrainStateMachine(tmp_path, FakeClient(ok=True), session_gap_ms=1, reporter=reporter)
    p = flash_page_pb2.FlashPage()
    p.absolute_timestamp_ms = 1_756_700_000_000
    c = p.chunks.add()
    c.audio_data.codec_manual_beamforming_data = b"\x01\x02\x03"
    out = sm.on_payload(_storage_buffer(5, p.SerializeToString()))
    assert out == []
    assert 5 in sm._pending
    assert reporter.errors and "unreadable" in reporter.errors[0]


def test_stale_diagnostic_page_still_resolves_immediately(tmp_path):
    # F5: a pre-2020 page with zero decoded frames is device noise, not lost
    # audio -> still resolved for the watermark immediately.
    sm = DrainStateMachine(tmp_path, FakeClient(ok=True), session_gap_ms=1)
    p = flash_page_pb2.FlashPage()
    p.absolute_timestamp_ms = 999
    out = sm.on_payload(_storage_buffer(4, p.SerializeToString()))
    assert _decode_ack(out[0]) == 4


def test_stale_page_with_readable_audio_preserved_not_resolved_until_upload(tmp_path):
    # F5: a pre-2020 page with real decoded audio (clock not yet set at
    # capture) must flow through the normal audio path -- never resolved
    # (ACK-deletable) before the audio actually uploads.
    client = SequencedClient([False])
    sm = DrainStateMachine(tmp_path, client, session_gap_ms=1)
    out1 = sm.on_payload(_storage_buffer(4, _page(999, [_opus_frame()])))
    assert out1 == []
    assert 4 in sm._pending
    assert len(list(tmp_path.glob("*.wav"))) == 1   # session open, holding the audio

    later = int(time.time() * 1000) + 10_000
    out2 = sm.on_payload(_storage_buffer(5, _page(later, [_opus_frame()])))
    assert out2 == []            # upload failed -> stays pending, no ack
    assert 4 in sm._pending
    assert len(client.calls) == 1


def test_stale_page_with_readable_audio_uploads_then_resolves(tmp_path):
    client = FakeClient(ok=True)
    sm = DrainStateMachine(tmp_path, client, session_gap_ms=1)
    out1 = sm.on_payload(_storage_buffer(4, _page(999, [_opus_frame()])))
    assert out1 == []

    later = int(time.time() * 1000) + 10_000
    out2 = sm.on_payload(_storage_buffer(5, _page(later, [_opus_frame()])))
    assert _decode_ack(out2[0]) == 4
    assert len(client.uploaded) == 1
    assert list(tmp_path.glob("session1_*.wav")) == []   # uploaded -> deleted


def test_reporter_sees_upload_outcomes(tmp_path):
    # F2/F9: last_upload_at / last_error are structurally null unless the drain
    # state machine actually calls the reporter.
    reporter = _Reporter()
    sm = DrainStateMachine(tmp_path, FakeClient(ok=True), session_gap_ms=1, reporter=reporter)
    T = 1_756_700_000_000
    sm.on_payload(_storage_buffer(1, _page(T, [_opus_frame()])))
    sm.on_payload(_storage_buffer(2, _page(T + 400_000, [_opus_frame()])))
    assert reporter.uploads == [(True, None)]
    assert reporter.last_upload_at is not None

    failing = _Reporter()
    sm2 = DrainStateMachine(tmp_path / "f", SequencedClient([False]), session_gap_ms=1, reporter=failing)
    sm2.on_payload(_storage_buffer(1, _page(T, [_opus_frame()])))
    sm2.on_payload(_storage_buffer(2, _page(T + 400_000, [_opus_frame()])))
    assert failing.uploads and failing.uploads[0][0] is False


def test_device_status_and_battery_route_to_reporter(tmp_path):
    # F2: nothing populated battery_pct / flash gauge because these kinds were
    # never routed anywhere.
    reporter = _Reporter()
    sm = DrainStateMachine(tmp_path, FakeClient(), reporter=reporter)
    m = server_pb2.PendantAllMsg()
    m.device_status.battery_status.soc = 74
    m.device_status.storage_state.total_capture_pages = 100
    m.device_status.storage_state.free_capture_pages = 40
    assert sm.on_payload(m.SerializeToString()) == []
    assert len(reporter.device_status) == 1

    b = server_pb2.PendantAllMsg()
    b.battery_status.soc = 51
    assert sm.on_payload(b.SerializeToString()) == []
    assert reporter.battery and reporter.battery[0].soc == 51


def test_upload_receives_session_start_ms(tmp_path):
    # F17: capture time must reach Chronicle, or the day file partitions by drain
    # time and a delayed drain collapses a whole day into one minute.
    client = FakeClient(ok=True)
    sm = DrainStateMachine(tmp_path, client, session_gap_ms=1)
    T = 1_756_700_000_000
    sm.on_payload(_storage_buffer(1, _page(T, [_opus_frame()])))
    sm.on_payload(_storage_buffer(2, _page(T + 400_000, [_opus_frame()])))
    assert client.uploaded[0][1] == T


def test_consume_survives_a_bad_payload_and_keeps_draining(tmp_path):
    # F4: one corrupt page must cost one page, not the connection (and not the
    # teardown that follows it).
    async def body():
        client = FakeClient(ok=True)
        sm = DrainStateMachine(tmp_path, client, session_gap_ms=1)
        queue: asyncio.Queue = asyncio.Queue()
        reasm = Reassembler()
        written = []

        async def write(fr):
            written.append(fr)

        for pkt in encode_frames(b"\xff\xff\xff not a protobuf \xff"):
            queue.put_nowait(pkt)
        for pkt in encode_frames(_storage_buffer(1, _page(1_756_700_000_000, [_opus_frame()]))):
            queue.put_nowait(pkt)
        for pkt in encode_frames(_storage_buffer(2, _page(1_756_700_400_000, [_opus_frame()]))):
            queue.put_nowait(pkt)
        queue.put_nowait(_SENTINEL)

        await _consume(queue, reasm, sm, write, (OSError,))
        return client, written

    client, written = asyncio.run(body())
    assert len(client.uploaded) == 1
    assert _decode_ack(written) == 1
