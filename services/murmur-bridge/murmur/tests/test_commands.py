import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "bridge" / "gen"))
import server_pb2
from murmur.bridge.framing import Reassembler
from murmur.bridge import commands

def _decode(frames):
    r = Reassembler()
    out = None
    for f in frames:
        got = r.feed(f)
        out = got if got is not None else out
    cmd = server_pb2.ServerCommandMsg(); cmd.ParseFromString(out)
    return cmd

def test_set_current_time_carries_epoch_and_request_id():
    cmd = _decode(commands.set_current_time(1_756_700_000_000))
    assert cmd.WhichOneof("content") == "set_current_time"
    assert cmd.HasField("request_data")     # field 30 present on every command
    assert cmd.request_data.request_id > 0

def test_download_flash_pages_drain_mode():
    cmd = _decode(commands.download_flash_pages(batch=True, real_time=False))
    sub = getattr(cmd, cmd.WhichOneof("content"))
    assert sub.batch_mode_enabled == 1 and sub.real_time_mode_enabled == 0

def test_delete_flash_page_carries_index():
    cmd = _decode(commands.delete_flash_page(17))
    assert cmd.WhichOneof("content") == "delete_flash_page"
    assert cmd.delete_flash_page.older_than_or_equal_to_index == 17

def test_get_device_status_has_request_id():
    cmd = _decode(commands.get_device_status())
    assert cmd.WhichOneof("content") == "get_device_status"
    assert cmd.HasField("request_data")

def test_start_recording_has_request_id():
    cmd = _decode(commands.start_recording())
    assert cmd.WhichOneof("content") == "start_recording"
    assert cmd.HasField("request_data")

def test_stop_recording_has_request_id():
    cmd = _decode(commands.stop_recording())
    assert cmd.WhichOneof("content") == "stop_recording"
    assert cmd.HasField("request_data")

def test_parse_response_routes_storage_buffer():
    resp = server_pb2.PendantAllMsg()
    resp.storage_buffer.index = 42
    resp.storage_buffer.flash_page = b"\x00"
    kind, msg = commands.parse_response(resp.SerializeToString())
    assert kind == "storage_buffer" and msg.index == 42

def test_parse_response_routes_device_status():
    resp = server_pb2.PendantAllMsg()
    resp.device_status.led_brightness = 5
    kind, msg = commands.parse_response(resp.SerializeToString())
    assert kind == "device_status" and msg.led_brightness == 5

def test_parse_response_routes_battery():
    resp = server_pb2.PendantAllMsg()
    resp.battery_status.soc = 88
    kind, msg = commands.parse_response(resp.SerializeToString())
    assert kind == "battery"

def test_parse_response_routes_audio():
    resp = server_pb2.PendantAllMsg()
    resp.real_time_audio_data.SetInParent()
    kind, msg = commands.parse_response(resp.SerializeToString())
    assert kind == "audio"

def test_parse_response_routes_other():
    resp = server_pb2.PendantAllMsg()
    resp.device_info.serial_num = "x"
    kind, msg = commands.parse_response(resp.SerializeToString())
    assert kind == "other"
