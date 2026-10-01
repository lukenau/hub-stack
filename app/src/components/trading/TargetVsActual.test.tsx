import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import type { TradingExplain, TradingPerf } from '../../lib/types';
import { TargetVsActual } from './TargetVsActual';

const perf = (over: Partial<TradingPerf> = {}): TradingPerf => ({
  curve: [],
  day_pnl: null,
  total_pnl: null,
  equity: 1000,
  positions: {},
  prices: {},
  ...over,
});

const explain = (targets: { symbol: string; weight: number }[]): TradingExplain =>
  ({ targets }) as TradingExplain;

function render(node: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(node);
  });
  const texts = renderer.root.findAllByType(Text);
  return {
    lines: texts.map((n) => flatten(n.props.children)),
    colorOf(line: string) {
      const node = texts.find((n) => flatten(n.props.children) === line);
      if (!node) throw new Error(`no line ${JSON.stringify(line)}`);
      return StyleSheet.flatten(node.props.style).color as string;
    },
  };
}

const flatten = (children: unknown): string =>
  Array.isArray(children) ? children.map(flatten).join('') : String(children ?? '');

test('no decision cycle yet: the card says so instead of comparing against nothing', () => {
  const { lines } = render(<TargetVsActual perf={perf({ positions: { SPY: 10 } })} />);
  expect(lines).toContain('no decision cycle yet today — targets appear after the first one');
  expect(lines).not.toContain('wants');
  expect(lines).not.toContain('SPY S&P 500');
});

test('an on-target leg is quiet: no sub-line, and not the alarm colour', () => {
  const view = render(
    <TargetVsActual
      perf={perf({ positions: { SPY: 10 }, prices: { SPY: 50 } })}
      explain={explain([{ symbol: 'SPY', weight: 0.5 }])}
    />,
  );
  expect(view.lines).toEqual(
    expect.arrayContaining(['Target vs actual', 'wants', 'holds', 'SPY S&P 500', '50.0%']),
  );
  expect(view.lines.some((l) => l.startsWith('off target'))).toBe(false);
  expect(view.colorOf('SPY S&P 500')).not.toBe(view.colorOf('holds'));
});

test('a decided-but-never-filled leg reads red with the plain-language sentence', () => {
  const view = render(
    <TargetVsActual
      perf={perf({ positions: { SPY: 10 }, prices: { SPY: 50 } })}
      explain={explain([
        { symbol: 'SPY', weight: 0.5 },
        { symbol: 'TLT', weight: 0.5 },
      ])}
    />,
  );
  const alarm = 'not filled — it decided this and the order never went through';
  expect(view.lines).toContain(alarm);
  expect(view.colorOf('TLT Long Treasuries')).toBe(view.colorOf(alarm));
  expect(view.colorOf('SPY S&P 500')).not.toBe(view.colorOf(alarm));
});

test('a leg materially off target names the gap to one decimal', () => {
  const view = render(
    <TargetVsActual
      perf={perf({ positions: { SPY: 12 }, prices: { SPY: 50 } })}
      explain={explain([{ symbol: 'SPY', weight: 0.5 }])}
    />,
  );
  expect(view.lines).toContain('off target by 10.0 points');
  expect(view.colorOf('SPY S&P 500')).toBe(view.colorOf('off target by 10.0 points'));
  expect(view.lines).toContain('60.0%');
});

test('a held leg with no price reads unknown, never zero', () => {
  const view = render(
    <TargetVsActual
      perf={perf({ positions: { GLD: 5 }, prices: {} })}
      explain={explain([{ symbol: 'GLD', weight: 0.1 }])}
    />,
  );
  expect(view.lines).toContain('held, but there’s no price right now to value it with');
  expect(view.lines).toContain('—');
  expect(view.lines.some((l) => l.startsWith('not filled'))).toBe(false);
});

test('the footer explains both columns', () => {
  const { lines } = render(
    <TargetVsActual
      perf={perf({ positions: { SPY: 10 }, prices: { SPY: 50 } })}
      explain={explain([{ symbol: 'SPY', weight: 0.5 }])}
    />,
  );
  expect(lines).toContain('wants = what the strategies blend to · holds = its share of the account now');
});
