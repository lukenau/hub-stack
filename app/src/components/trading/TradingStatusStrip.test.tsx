// The halt banner and its Resume button — the one write on a surface that is
// otherwise read-only by design (docs/inventory/trading.md §6).
//
// The gate is REAL here: a tap runs api.resumeTrading() → api.applyWrite(),
// which POSTs the canonical WriteRequest to /action/challenge and only then
// hits the not-yet-built assertion step. Nothing stubs a success; the typed
// GateNotWiredError surfaces through the PWA's own writeErrorMessage rules.
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { TradingStatus } from '../../lib/types';
import { api, ApplyError, GateNotWiredError, GATE_NOT_WIRED_MESSAGE } from '../../lib/api';
import { TradingStatusStrip, writeErrorMessage } from './TradingStatusStrip';

const BASE = 'https://hub.example.com/api';

const CHALLENGE = {
  ok: true,
  status: 200,
  json: async () => ({
    challenge: 'Y2hhbGxlbmdl',
    rp_id: 'hub.example.com',
    user_verification: 'required',
    allowed_credentials: [{ id: 'cred-1', type: 'public-key' }],
    timeout_ms: 60000,
  }),
};

const status = (over: Partial<TradingStatus> = {}): TradingStatus => ({
  status: 'ok',
  mode: 'sim',
  halted: null,
  ...over,
});

function flat(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(flat).join('');
  if (typeof node === 'object' && 'props' in (node as { props?: { children?: unknown } })) {
    return flat((node as { props: { children?: unknown } }).props.children);
  }
  return String(node);
}

function render(node: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(node);
  });
  return renderer;
}

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map((n) => flat(n.props.children));

/** The outermost pressable whose rendered text contains `label`. */
const button = (r: TestRenderer.ReactTestRenderer, label: string) =>
  r.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.findAllByType(Text).some((t) => flat(t.props.children).includes(label)),
  )[0];

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
});

test('no status at all renders nothing — a missing /trading route hides the strip', () => {
  expect(render(<TradingStatusStrip trading={null} />).toJSON()).toBeNull();
});

test('an offline agent is one grey line, not an error card', () => {
  const r = render(<TradingStatusStrip trading={status({ status: 'offline', mode: 'unknown' })} />);
  expect(texts(r)).toEqual(['trading agent · offline']);
});

test('a healthy agent shows the badge and the health sentence, and no banner', () => {
  const r = render(<TradingStatusStrip trading={status({ last_tick_age_s: 30 })} />);
  const t = texts(r);
  expect(t).toContain('PRACTICE');
  expect(t).toContain('running · last check just now');
  expect(t.some((s) => s.startsWith('Trading is paused'))).toBe(false);
});

test('a halt is a red sentence with the reason, the since-line, and a Resume button', () => {
  const r = render(
    <TradingStatusStrip
      trading={status({
        halted: '3 losing days',
        halted_since: new Date(Date.now() - 3 * 3600_000).toISOString(),
      })}
    />,
  );
  const t = texts(r);
  expect(t).toContain("Trading is paused — 3 losing days. It won't trade again until resumed.");
  expect(t).toContain('paused since 3h ago');
  expect(t).toContain('Resume trading');
});

test('the gated-streak banner appears only when the counter is nonzero, and counts in words', () => {
  const quiet = render(<TradingStatusStrip trading={status({ gated_streak: 0 })} />);
  expect(texts(quiet).some((s) => s.startsWith('Risk rules'))).toBe(false);

  const one = render(<TradingStatusStrip trading={status({ gated_streak: 1 })} />);
  expect(texts(one)).toContain('Risk rules have blocked the last 1 trade idea — investigate.');

  const many = render(<TradingStatusStrip trading={status({ gated_streak: 4 })} />);
  expect(texts(many)).toContain('Risk rules have blocked the last 4 trade ideas — investigate.');
});

test('Resume posts the canonical write to /action/challenge and surfaces the gate error', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce(CHALLENGE);
  const r = render(<TradingStatusStrip trading={status({ halted: 'daily loss cap' })} />);

  await act(async () => {
    await button(r, 'Resume trading').props.onPress();
  });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith(`${BASE}/action/challenge`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request: { action: 'trading.resume' } }),
  });

  const t = texts(r);
  // Nothing faked: the success line is absent, the error is on screen, and the
  // button is back to its idle label rather than stuck on "Resuming…".
  expect(t.some((s) => s.startsWith('Resumed —'))).toBe(false);
  expect(t).toContain(GATE_NOT_WIRED_MESSAGE);
  expect(t).toContain('Resume trading');
});

test('a server that refuses the challenge shows the server’s own message', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status: 412,
    json: async () => ({ code: 'no_passkey', detail: 'No passkey registered. Enrol in Settings first.' }),
  });
  const r = render(<TradingStatusStrip trading={status({ halted: 'daily loss cap' })} />);

  await act(async () => {
    await button(r, 'Resume trading').props.onPress();
  });

  expect(texts(r)).toContain('No passkey registered. Enrol in Settings first.');
  expect(texts(r).some((s) => s.startsWith('Resumed —'))).toBe(false);
});

test('a resumed banner keeps the halt copy — nothing invalidates the query (OQ-20)', async () => {
  jest.spyOn(api, 'resumeTrading').mockResolvedValue({
    status: 'applied',
    code: 0,
    stdout: '{"resumed":true}',
    stderr: '',
    applied_at: '2026-09-11T15:00:00Z',
  });
  const r = render(<TradingStatusStrip trading={status({ halted: 'daily loss cap' })} />);

  await act(async () => {
    await button(r, 'Resume trading').props.onPress();
  });

  const t = texts(r);
  expect(t).toContain(
    'Resumed — this clears at the next check, and the first day back trades at half size.',
  );
  expect(t).not.toContain('Resume trading');
  // The banner itself is still there: only the next ['trading'] poll clears it.
  expect(t).toContain("Trading is paused — daily loss cap. It won't trade again until resumed.");
});

describe('writeErrorMessage', () => {
  test('a cancelled gate says nothing at all', () => {
    expect(writeErrorMessage(new GateNotWiredError('cancelled'))).toBeNull();
    expect(writeErrorMessage(new ApplyError('cancelled', 'whatever'))).toBeNull();
  });

  test('every other typed code shows its message', () => {
    expect(writeErrorMessage(new ApplyError('bridge_error', 'spindle /resume HTTP 403'))).toBe(
      'spindle /resume HTTP 403',
    );
  });

  test('an untyped throw falls back to the generic line', () => {
    expect(writeErrorMessage('boom')).toBe('Resume failed.');
    expect(writeErrorMessage(new Error('network down'))).toBe('network down');
  });
});
