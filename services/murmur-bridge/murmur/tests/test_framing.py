import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "bridge" / "gen"))
from murmur.bridge.framing import encode_frames, Reassembler

def test_roundtrip_single_fragment():
    payload = b"\x01\x02\x03"
    frames = encode_frames(payload)
    assert len(frames) == 1
    r = Reassembler()
    assert r.feed(frames[0]) == payload

def test_roundtrip_multi_fragment_out_of_order():
    payload = bytes(range(256)) * 3   # > 1 fragment at mtu_payload=150
    frames = encode_frames(payload, mtu_payload=150)
    assert len(frames) > 1
    r = Reassembler()
    out = None
    for f in reversed(frames):        # deliberately out of order
        got = r.feed(f)
        out = got if got is not None else out
    assert out == payload

def test_interleaved_messages_do_not_mix():
    a, b = b"A" * 300, b"B" * 300
    fa, fb = encode_frames(a, 150), encode_frames(b, 150)
    r = Reassembler()
    assert r.feed(fa[0]) is None
    assert r.feed(fb[0]) is None
    assert r.feed(fb[1]) == b
    assert r.feed(fa[1]) == a
