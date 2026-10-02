import sys, pathlib, time, wave
sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "bridge" / "gen"))
import flash_page_pb2
from murmur.bridge.audio import extract_opus_frames, WavSession, StalePage
import opuslib, pytest

def _page(ts_ms, frames):
    p = flash_page_pb2.FlashPage()
    p.absolute_timestamp_ms = ts_ms
    for f in frames:
        c = p.chunks.add()
        c.audio_data.codec_beamforming_data = f
    return p.SerializeToString()

def _opus_frame():
    enc = opuslib.Encoder(16000, 1, opuslib.APPLICATION_VOIP)
    return enc.encode(b"\x00\x00" * 320, 320)

def test_extracts_frames_and_timestamp():
    f = _opus_frame()
    ts, frames = extract_opus_frames(_page(1_756_700_000_000, [f, f]))
    assert ts == 1_756_700_000_000 and frames == [f, f]

def test_diagnostic_page_yields_no_frames():
    p = flash_page_pb2.FlashPage(); p.absolute_timestamp_ms = 1_756_700_000_000
    ts, frames = extract_opus_frames(p.SerializeToString())
    assert frames == []

def test_status_only_chunk_yields_no_frames():
    p = flash_page_pb2.FlashPage()
    p.absolute_timestamp_ms = 1_756_700_000_000
    c = p.chunks.add()
    c.storage_status.did_start_storage_session = True
    ts, frames = extract_opus_frames(p.SerializeToString())
    assert frames == []

def test_stale_diagnostic_page_still_rejected():
    # No decoded frames -> nothing to lose -> still StalePage (unchanged).
    with pytest.raises(StalePage):
        extract_opus_frames(_page(999, []))

def test_stale_timestamp_with_audio_gets_fallback_timestamp():
    # F5: a pre-2020 stamp with real decoded audio means the pendant's clock
    # wasn't set yet at capture, not that the page is noise. Must NOT raise —
    # the frames must survive with a fallback "now" timestamp instead.
    f = _opus_frame()
    before = int(time.time() * 1000)
    ts, frames = extract_opus_frames(_page(999, [f]))
    after = int(time.time() * 1000)
    assert frames == [f]
    assert before <= ts <= after

def test_wav_session_writes_playable_wav(tmp_path):
    s = WavSession(tmp_path, session_id=1, start_ms=1_756_700_000_000)
    s.add_frames([_opus_frame()] * 50)   # 1 second
    out = s.close()
    with wave.open(str(out)) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1
        assert w.getnframes() == 50 * 320

def test_unreadable_codec_field_raises(tmp_path=None):
    # F5: audio_data present but in a codec field we don't decode — must NOT
    # look like a diagnostic page (which the daemon ACK-deletes).
    from murmur.bridge.audio import UnreadableAudio
    p = flash_page_pb2.FlashPage()
    p.absolute_timestamp_ms = 1_756_700_000_000
    c = p.chunks.add()
    c.audio_data.codec_manual_beamforming_data = b"\x01\x02"
    with pytest.raises(UnreadableAudio):
        extract_opus_frames(p.SerializeToString())
