import itertools, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent / "gen"))
import common_pb2

_Wrapper = common_pb2.BLEMessageFromNativeToPendant
_InWrapper = common_pb2.BLEMessageFromPendantToNative
_counter = itertools.count(1)

def encode_frames(payload: bytes, mtu_payload: int = 150) -> list[bytes]:
    chunks = [payload[i:i + mtu_payload] for i in range(0, len(payload), mtu_payload)] or [b""]
    idx = next(_counter)
    frames = []
    for seq, chunk in enumerate(chunks):
        w = _Wrapper()
        w.index = idx
        w.ble_fragment_seq = seq
        w.num_fragments = len(chunks)
        w.payload = chunk
        frames.append(w.SerializeToString())
    return frames

class Reassembler:
    def __init__(self):
        self._parts: dict[int, dict[int, bytes]] = {}
        self._total: dict[int, int] = {}

    def feed(self, packet: bytes) -> bytes | None:
        w = _InWrapper(); w.ParseFromString(packet)
        parts = self._parts.setdefault(w.index, {})
        parts[w.ble_fragment_seq] = w.payload
        self._total[w.index] = w.num_fragments
        if len(parts) == self._total[w.index]:
            data = b"".join(parts[i] for i in sorted(parts))
            del self._parts[w.index], self._total[w.index]
            return data
        return None
