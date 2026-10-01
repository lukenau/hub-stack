// Composition-level tests for the Trading screen: which queries it opens (with
// which tuning), and which card each loading/empty/unavailable combination puts
// on screen. The cards' own copy is covered by tradingCards.test.tsx — what is
// only testable HERE is the caller: a card whose mount condition is wrong is
// invisible to every unit test of that card.
jest.mock('expo-router', () => ({
  // Screen arms the tab-re-press scroll with it; behaviour is asserted in Screen.test.tsx.
  useScrollToTop: () => {},
  useIsFocused: () => true,
  router: { push: jest.fn() },
}));

jest.mock('../../lib/query', () => ({
  ...jest.requireActual('../../lib/query'),
  usePoll: jest.fn(),
}));

// The equity chart is Skia, which has no renderer under jest; it carries its
// own tests (task-15-report.md). Only its PRESENCE matters to this file.
jest.mock('../charts/EquityChart', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { EquityChart: () => React.createElement(Text, null, 'EQUITY CHART') };
});

import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import type { QueryKey } from '@tanstack/react-query';
import { QUERY_TUNING, usePoll } from '../../lib/query';
import { api } from '../../lib/api';
import type { TradingPerf } from '../../lib/types';
import TradingScreen from './TradingScreen';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const PERF: TradingPerf = {
  curve: [],
  day_pnl: null,
  total_pnl: null,
  equity: 1000,
  cash: 100,
  positions: {},
  prices: {},
};

type State = { data?: unknown; isLoading?: boolean };

/** Query state by key, defaulting to "resolved, empty". */
function stub(states: Record<string, State>) {
  (usePoll as jest.Mock).mockImplementation((key: QueryKey) => {
    const name = String(key[0]);
    const s = states[name] ?? {};
    return {
      data: s.data ?? undefined,
      isLoading: s.isLoading ?? false,
      isError: false,
      error: null,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      refetch: jest.fn(),
    };
  });
}

function flat(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(flat).join('');
  if (typeof node === 'object' && 'props' in (node as { props?: { children?: unknown } })) {
    return flat((node as { props: { children?: unknown } }).props.children);
  }
  return String(node);
}

// Mounted trees are torn down after each test: SkeletonCard's pulse and the
// refresh control's spinner are Animated.loops, and an un-unmounted one keeps
// a timer — and the whole jest run — alive after the assertions pass.
const mounted: TestRenderer.ReactTestRenderer[] = [];

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <TradingScreen />
      </SafeAreaProvider>,
    );
  });
  mounted.push(renderer);
  return renderer;
}

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map((n) => flat(n.props.children));

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((r) => r.unmount());
  });
});

test('the eight PWA queries are opened with their PWA tuning, and nothing else', () => {
  stub({});
  render();
  const calls = (usePoll as jest.Mock).mock.calls;
  expect(calls.map((c) => c[0])).toEqual([
    ['trading'],
    ['trading-perf'],
    ['trading-explain'],
    ['trading-events'],
    ['decisions'],
    ['trading-exposure'],
    ['trading-log'],
    ['trading-proposals'],
  ]);
  expect(calls.map((c) => c[1])).toEqual([
    api.trading,
    api.tradingPerf,
    api.tradingExplain,
    api.tradingEvents,
    api.decisions,
    api.tradingExposure,
    api.tradingLog,
    api.tradingProposals,
  ]);
  // Straight from QUERY_TUNING — no interval is retyped at this call site.
  expect(calls.map((c) => c[2])).toEqual([
    QUERY_TUNING.trading,
    QUERY_TUNING['trading-perf'],
    QUERY_TUNING['trading-explain'],
    QUERY_TUNING['trading-events'],
    QUERY_TUNING['decisions-shared'],
    QUERY_TUNING['trading-exposure'],
    QUERY_TUNING['trading-log'],
    QUERY_TUNING['trading-proposals'],
  ]);
});

test('a first load shows the chart skeleton and none of the data cards', () => {
  stub({ 'trading-perf': { isLoading: true }, 'trading-log': { isLoading: true } });
  const r = render();
  const t = texts(r);
  expect(t).toContain('Trading');
  expect(t).not.toContain('EQUITY CHART');
  expect(t).not.toContain('Target vs actual');
  // The blocked card waits for its query to RESOLVE — including to null.
  expect(t.some((s) => s.startsWith('the blocked-order history'))).toBe(false);
});

test('a resolved-but-null log still mounts the blocked card, which says it is unavailable', () => {
  stub({ 'trading-log': { data: null } });
  expect(texts(render())).toContain(
    'the blocked-order history isn’t available right now — it comes back on its own',
  );
});

test('perf data brings the chart, target-vs-actual and the positions card', () => {
  stub({ 'trading-perf': { data: PERF } });
  const t = texts(render());
  expect(t).toContain('EQUITY CHART');
  expect(t).toContain('Target vs actual');
  expect(t).toContain('What it holds');
});

test('the ETF look-through falls back to one line — but only once perf is in', () => {
  stub({ 'trading-perf': { data: PERF }, 'trading-exposure': { data: null } });
  expect(texts(render())).toContain(
    "the ETF look-through isn't available right now — it comes back on its own",
  );

  stub({ 'trading-exposure': { data: null } });
  const withoutPerf = texts(render());
  expect(withoutPerf.some((s) => s.startsWith('the ETF look-through'))).toBe(false);
  expect(withoutPerf).not.toContain('Paper book · what the ETFs hold');
});

test('the proposal ledger is always on the page, published or not', () => {
  stub({});
  const t = texts(render());
  expect(t).toContain('Self-improvement · proposals from the weekly review');
  expect(t).toContain(
    "the proposal ledger hasn't been published yet — it appears after the first weekly review",
  );
});

test('empty log sections stay off the page rather than rendering empty cards', () => {
  stub({ 'trading-log': { data: { sessions: [], decisions: [], budget: null } } });
  const t = texts(render());
  expect(t).not.toContain('Session log');
  expect(t).not.toContain('Daily decisions · what each strategy chose');
  expect(t.some((s) => s.startsWith('Trading activity'))).toBe(false);
});
