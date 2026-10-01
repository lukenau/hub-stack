// The multi-host shell list, and specifically the sleeping-MacBook state the
// parity inventory calls out (ops.md §1.6): a host that cannot be reached
// reports ok:false — it is NOT an error. The VPS rows keep rendering, the
// unreachable host gets one warn-toned line inside the same card, and only the
// controls aimed at that host go dead.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { StatePanel } from '../shell';
import { ShellsSection } from './ShellsSection';
import type { TmuxInventory, TmuxSession } from '../../lib/types';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function shell(over: Partial<TmuxSession> = {}): TmuxSession {
  return {
    name: 'claude-abc',
    created: 1_757_500_000,
    attached: false,
    windows: 2,
    protected: false,
    host: 'vps',
    title: null,
    session_id: null,
    ...over,
  };
}

const SLEEPING_MAC: TmuxInventory = {
  sessions: [shell(), shell({ name: 'claude-main', protected: true }), shell({ name: 'claude-att', attached: true })],
  hosts: [
    { id: 'vps', label: 'VPS', ok: true, error: null },
    { id: 'mac', label: 'MacBook', ok: false, error: 'ssh: connect timed out' },
  ],
};

function fakeQuery(data: TmuxInventory | undefined, over: Partial<UseQueryResult<TmuxInventory, Error>> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn().mockResolvedValue({}),
    ...over,
  } as unknown as UseQueryResult<TmuxInventory, Error>;
}

function render(q: UseQueryResult<TmuxInventory, Error>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>
          <ShellsSection q={q} />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

function texts(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).flatMap((n) => {
    const kids = Array.isArray(n.props.children) ? n.props.children : [n.props.children];
    return kids.filter((c: unknown): c is string => typeof c === 'string');
  });
}

/** The Pressable element (not the host View) carrying this label. */
function control(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.find(
    (n) => typeof n.type === 'function' && n.props.accessibilityLabel === label && n.props.onPress !== undefined,
  );
}

test('an unreachable host is a warn line inside the card, never the error panel', () => {
  const renderer = render(fakeQuery(SLEEPING_MAC));
  const t = texts(renderer);
  expect(t).toContain('MacBook unreachable — ssh: connect timed out. Asleep?');
  expect(renderer.root.findAllByType(StatePanel)).toHaveLength(0);
  expect(t).not.toContain('Shells unavailable');
  // The reachable host's rows are untouched by its neighbour being asleep.
  expect(t).toContain('claude-abc');
  expect(t).toContain('claude-main');
});

test('the controls only go dead once the UNREACHABLE host is the selected one', () => {
  const renderer = render(fakeQuery(SLEEPING_MAC));
  // Default selection is 'vps', which is ok — both controls live.
  expect(control(renderer, 'New session').props.disabled).toBe(false);
  expect(control(renderer, 'Resume').props.disabled).toBe(false);

  act(() => {
    control(renderer, 'MacBook').props.onPress();
  });
  expect(control(renderer, 'New session').props.disabled).toBe(true);
  expect(control(renderer, 'Resume').props.disabled).toBe(true);
});

test('Kill is hidden — not disabled — for protected and attached sessions', () => {
  const renderer = render(fakeQuery(SLEEPING_MAC));
  const kills = renderer.root
    .findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Kill '))
    .map((n) => n.props.accessibilityLabel);
  expect(new Set(kills)).toEqual(new Set(['Kill claude-abc']));
});

test('with one host there are no host pills and the section still works', () => {
  const renderer = render(
    fakeQuery({ sessions: [shell()], hosts: [{ id: 'vps', label: 'VPS', ok: true, error: null }] }),
  );
  expect(texts(renderer)).not.toContain('VPS');
  expect(control(renderer, 'New session').props.disabled).toBe(false);
});

test('no data at all renders nothing — this section has no loading panel', () => {
  const renderer = render(fakeQuery(undefined, { isLoading: true }));
  // Ops.tsx:660-661: the ONLY StatePanel this section can render is the error
  // one. While a bridge read is in flight (which can be tens of seconds) the
  // card simply is not there yet.
  expect(renderer.root.findAllByType(StatePanel)).toHaveLength(0);
  expect(texts(renderer)).not.toContain('No tmux sessions running.');
  // The header and its pills are always present.
  expect(texts(renderer)).toContain('Claude shells');
});

test('a failed read shows the error panel with the server message', () => {
  const renderer = render(fakeQuery(undefined, { isError: true, error: new Error('tmuxd unreachable: no socket') }));
  const t = texts(renderer);
  expect(renderer.root.findAllByType(StatePanel)).toHaveLength(1);
  expect(t).toContain('Shells unavailable');
  expect(t).toContain('tmuxd unreachable: no socket');
});
