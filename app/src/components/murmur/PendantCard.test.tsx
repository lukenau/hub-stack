// PendantCard: pure-logic unit tests (state copy/color, gated-write error
// mapping) plus a few render-based checks for the branches that are easy to
// silently break — the hidden second button when disconnected, and the
// bridge-down disable + hint. Full visual rendering is not verifiable on this
// host; these assert structure/props, not pixels.
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ApplyError, GateNotWiredError, GATE_NOT_WIRED_MESSAGE } from '../../lib/api';
import { PendantCard, stateColor, stateLabel, writeErrorMessage } from './PendantCard';
import type { MurmurStatus } from '../../lib/types';

jest.mock('../../lib/api', () => {
  const actual = jest.requireActual('../../lib/api');
  return { ...actual, api: { ...actual.api, applyWrite: jest.fn() } };
});

describe('stateLabel / stateColor', () => {
  test.each([
    ['recording', 'Recording', 'status-up'],
    ['paused', 'Paused', 'status-warn'],
    ['disconnected', 'Disconnected', 'status-down'],
    ['never_seen', 'Never bonded', 'status-down'],
  ] as const)('%s -> %s / %s', (state, label, color) => {
    expect(stateLabel(state)).toBe(label);
    expect(stateColor(state)).toBe(color);
  });
});

describe('writeErrorMessage', () => {
  test('ApplyError with a non-cancelled code surfaces its message', () => {
    expect(writeErrorMessage(new ApplyError('bridge_error', 'spindle unreachable'))).toBe('spindle unreachable');
  });

  test('a cancelled code is silent (null)', () => {
    expect(writeErrorMessage(new ApplyError('cancelled'))).toBeNull();
    expect(writeErrorMessage(new GateNotWiredError('cancelled'))).toBeNull();
  });

  test('GateNotWiredError (the no-signer path) surfaces its message', () => {
    expect(writeErrorMessage(new GateNotWiredError())).toBe(GATE_NOT_WIRED_MESSAGE);
  });

  test('a plain Error surfaces its message; a non-Error falls back to a generic string', () => {
    expect(writeErrorMessage(new Error('boom'))).toBe('boom');
    expect(writeErrorMessage('nope')).toBe('Write failed.');
  });
});

function pendant(overrides: Partial<MurmurStatus['pendant']> = {}): MurmurStatus {
  return {
    generated_at: new Date().toISOString(),
    pendant: {
      state: 'recording',
      battery_pct: 60,
      flash_used_pages: 5,
      flash_total_pages: 50,
      bond_owner: 'iphone',
      last_status_at: new Date().toISOString(),
      ...overrides,
    },
    bridge: {
      host: 'iphone',
      up: true,
      last_heartbeat_at: null,
      queue_wavs: null,
      last_upload_at: null,
      last_error: null,
    },
    pipeline: { backend_up: true, conversations_today: 1, last_conversation_at: null, marginal_rtf: null, mongo_gb: null },
    memory: { etl_last_run_at: null, etl_docs_today: null, canonical_day_bytes: null },
    chain_last_complete_at: null,
  };
}

function render(data: MurmurStatus, onApplied = () => Promise.resolve()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<PendantCard data={data} onApplied={onApplied} />);
  });
  return renderer;
}

// Pressable is exotic/forwardRef-wrapped in a way that findAllByType(Pressable)
// does not reliably match under this RN version, and findAllByProps matches
// every layer (composite + host) that forwards accessibilityRole. Restrict to
// the single HOST node per button — the one carrying accessibilityState,
// confirmed by a raw toJSON() dump to appear exactly once per Pressable.
function buttons(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && 'accessibilityState' in node.props,
  );
}

test('never_seen renders no button controls', () => {
  const renderer = render(pendant({ state: 'never_seen' }));
  expect(buttons(renderer)).toHaveLength(0);
});

test('disconnected hides the pause/resume button but keeps Drain now', () => {
  const renderer = render(pendant({ state: 'disconnected' }));
  expect(buttons(renderer)).toHaveLength(1);
});

test('recording shows both buttons, neither disabled, when the bridge is up', () => {
  const renderer = render(pendant({ state: 'recording' }));
  const bs = buttons(renderer);
  expect(bs).toHaveLength(2);
  for (const b of bs) expect(b.props.accessibilityState.disabled).toBe(false);
});

test('bridge down disables both controls even though the pendant is only paused', () => {
  const data = pendant({ state: 'paused' });
  data.bridge.up = false;
  const renderer = render(data);
  const bs = buttons(renderer);
  expect(bs).toHaveLength(2);
  for (const b of bs) expect(b.props.accessibilityState.disabled).toBe(true);
  const texts = renderer.root.findAllByType(Text).map((n) => n.props.children).flat();
  expect(texts).toContain('Bridge is down — actions can’t reach the pendant right now.');
});
