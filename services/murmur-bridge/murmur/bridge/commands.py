import itertools, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent / "gen"))
import server_pb2
from .framing import encode_frames

_req = itertools.count(1)

def _finish(cmd) -> list[bytes]:
    cmd.request_data.request_id = next(_req)
    return encode_frames(cmd.SerializeToString())

def set_current_time(epoch_ms: int) -> list[bytes]:
    c = server_pb2.ServerCommandMsg()
    c.set_current_time.unix_timestamp_ms = epoch_ms
    return _finish(c)

def download_flash_pages(batch: bool, real_time: bool) -> list[bytes]:
    c = server_pb2.ServerCommandMsg()
    c.download_flash_pages.batch_mode_enabled = batch
    c.download_flash_pages.real_time_mode_enabled = real_time
    return _finish(c)

def delete_flash_page(up_to_index: int) -> list[bytes]:
    c = server_pb2.ServerCommandMsg()
    c.delete_flash_page.older_than_or_equal_to_index = up_to_index
    return _finish(c)

def get_device_status() -> list[bytes]:
    c = server_pb2.ServerCommandMsg()
    c.get_device_status.SetInParent()
    return _finish(c)

def start_recording() -> list[bytes]:
    c = server_pb2.ServerCommandMsg()
    c.start_recording.SetInParent()
    return _finish(c)

def stop_recording() -> list[bytes]:
    c = server_pb2.ServerCommandMsg()
    c.stop_recording.SetInParent()
    return _finish(c)

_ROUTES = {"storage_buffer": "storage_buffer", "device_status": "device_status",
           "battery_status": "battery", "real_time_audio_data": "audio"}

def parse_response(payload: bytes):
    m = server_pb2.PendantAllMsg(); m.ParseFromString(payload)
    which = m.WhichOneof("content") or ""
    return _ROUTES.get(which, "other"), getattr(m, which) if which else m
