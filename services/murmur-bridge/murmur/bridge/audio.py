import logging, pathlib, sys, time, wave
sys.path.insert(0, str(pathlib.Path(__file__).parent / "gen"))
import flash_page_pb2
import opuslib

MIN_TS_MS = 1_577_836_800_000  # 2020-01-01

class StalePage(Exception):
    pass

class UnreadableAudio(Exception):
    """The page carries an audio_data chunk whose bytes are in a codec field we
    do not decode (codec_manual_beamforming_data, encrypted_codec_*). Distinct
    from a diagnostic page with no audio at all: resolving THIS index would
    ACK-delete the only copy of real audio, so the caller must keep it pending."""

def extract_opus_frames(flash_page_bytes: bytes) -> tuple[int, list[bytes]]:
    page = flash_page_pb2.FlashPage()
    page.ParseFromString(flash_page_bytes)
    frames = [chunk.audio_data.codec_beamforming_data
              for chunk in page.chunks
              if chunk.audio_data.codec_beamforming_data]
    if not frames and any(chunk.HasField("audio_data") for chunk in page.chunks):
        raise UnreadableAudio(page.absolute_timestamp_ms)
    if page.absolute_timestamp_ms < MIN_TS_MS:
        if not frames:
            raise StalePage(page.absolute_timestamp_ms)
        # The pendant's clock is set only via SetCurrentTime on connect init, so a
        # page recorded before the first-ever connect carries a pre-2020 stamp but
        # can still hold real audio. The true capture time is unrecoverable; a
        # fallback of "now" preserves the audio through the normal upload path
        # instead of losing it to an immediate, unheard ACK-delete.
        fallback_ms = int(time.time() * 1000)
        logging.warning(
            "flash page has pre-2020 timestamp (%s) but %d decoded audio frame(s); "
            "clock was not yet set at capture — using fallback timestamp %s",
            page.absolute_timestamp_ms, len(frames), fallback_ms,
        )
        return fallback_ms, frames
    return page.absolute_timestamp_ms, frames

class WavSession:
    def __init__(self, out_dir: pathlib.Path, session_id: int, start_ms: int):
        self.path = pathlib.Path(out_dir) / f"session{session_id}_{start_ms}.wav"
        self._wav = wave.open(str(self.path), "wb")
        self._wav.setnchannels(1)
        self._wav.setsampwidth(2)
        self._wav.setframerate(16000)
        self._dec = opuslib.Decoder(16000, 1)

    def add_frames(self, frames: list[bytes]) -> None:
        for f in frames:
            self._wav.writeframes(self._dec.decode(f, 320))

    def close(self) -> pathlib.Path:
        self._wav.close()
        return self.path
