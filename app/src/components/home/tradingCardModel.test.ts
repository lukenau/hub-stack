import {
  MODE_TONE,
  TRADING_OFFLINE_LINE,
  sparkline,
  sparklineLabel,
  SPARK_H,
  SPARK_W,
  tradingCardState,
  tradingCardView,
} from './tradingCardModel';
import type { TradingPerf, TradingStatus } from '../../lib/types';

const NOW = Date.parse('2026-09-10T18:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const status = (over: Partial<TradingStatus> = {}): TradingStatus => ({
  status: 'ok',
  mode: 'dryrun',
  halted: null,
  ...over,
});

const perf = (over: Partial<TradingPerf> = {}): TradingPerf => ({
  curve: [],
  day_pnl: null,
  total_pnl: null,
  ...over,
});

describe('card presence (TradingCard.tsx:28-39)', () => {
  test('the offline state is a bare line, word for word', () => {
    expect(TRADING_OFFLINE_LINE).toBe('trading · offline');
  });

  test('no payload renders nothing; an offline spindle renders the bare line', () => {
    expect(tradingCardState(undefined)).toBe('hidden');
    expect(tradingCardState(null)).toBe('hidden');
    expect(tradingCardState(status({ status: 'offline' }))).toBe('offline');
    expect(tradingCardState(status())).toBe('card');
  });
});

describe('mode, broker and badge (TradingCard.tsx:41-56)', () => {
  test('live with no broker is forced to PAPER — a red LIVE badge on paper equity misleads', () => {
    const v = tradingCardView(status({ mode: 'live' }), null, NOW);
    expect(v.brokerLabel).toBe('PAPER');
    expect(v.badgeLabel).toBe('PAPER');
    expect(v.tone).toBe(MODE_TONE.dryrun);
  });

  test('live WITH a broker keeps the live treatment', () => {
    const v = tradingCardView(status({ mode: 'live', broker: 'alpaca' }), null, NOW);
    expect(v.brokerLabel).toBe('LIVE');
    expect(v.badgeLabel).toBe('live · LIVE');
    expect(v.tone).toBe(MODE_TONE.live);
  });

  test('a broker whose name says paper is paper, whatever the mode claims', () => {
    const v = tradingCardView(status({ mode: 'live', broker: 'alpaca-paper' }), null, NOW);
    expect(v.brokerLabel).toBe('PAPER');
    expect(v.badgeLabel).toBe('live · PAPER');
  });

  test('sim keeps the quiet tone and an upper-cased label', () => {
    const v = tradingCardView(status({ mode: 'sim', broker: 'none' }), null, NOW);
    expect(v.tone).toBe(MODE_TONE.sim);
    expect(v.brokerLabel).toBe('SIM');
  });

  test('an unknown mode falls back to the sim tone rather than crashing', () => {
    expect(tradingCardView(status({ mode: 'shadow' }), null, NOW).tone).toBe(MODE_TONE.sim);
  });

  test('the rail is not the text ink — sim would read as a dead grey stripe', () => {
    expect(MODE_TONE.sim.color).toBe('fg-2');
    expect(MODE_TONE.sim.rail).toBe('ink-faint');
  });
});

describe('halted (TradingCard.tsx:118-135)', () => {
  test('the reason is carried verbatim and the line says it stays halted', () => {
    const v = tradingCardView(status({ halted: 'drawdown breaker', halted_since: iso(3600_000) }), null, NOW);
    expect(v.halted).toBe('drawdown breaker');
    expect(v.haltedLine).toBe("paused since 1h ago · it won't trade again until manually resumed");
  });

  test('with no since-timestamp the sentence still stands alone', () => {
    expect(tradingCardView(status({ halted: 'manual' }), null, NOW).haltedLine).toBe(
      "it won't trade again until manually resumed",
    );
  });
});

describe('display divisor (TradingCard.tsx:57-70)', () => {
  test('unscaled, the numbers are the raw ones', () => {
    const v = tradingCardView(
      status({ equity: 1234.5, cash: 200, spent_today: 50 }),
      perf({ day_pnl: 12.7, total_pnl: -30.2 }),
      NOW,
    );
    expect(v.equityText).toBe('$1,234.50');
    expect(v.scaleNote).toBeNull();
    expect(v.dayPnl).toEqual({ text: '+$13 today', positive: true });
    expect(v.totalPnl).toEqual({ text: '−$30 total', positive: false });
    expect(v.footer.map((f) => f.text)).toEqual(['cash $200', 'spent today $50']);
  });

  test('a server-supplied *_display value is preferred over dividing', () => {
    const v = tradingCardView(
      status({ display_divisor: 10 }),
      perf({ equity: 10_000, equity_display: 999, day_pnl: 100, day_pnl_display: 9.5 }),
      NOW,
    );
    expect(v.equityText).toBe('$999.00');
    expect(v.dayPnl?.text).toBe('+$9.5 today');
    expect(v.scaleNote).toBe('(×10 account scale: $10,000)');
  });

  test('without one, the divisor is applied — and cents survive the scaling', () => {
    const v = tradingCardView(status({ display_divisor: 4 }), perf({ equity: 1000, day_pnl: 41 }), NOW);
    expect(v.equityText).toBe('$250.00');
    expect(v.dayPnl?.text).toBe('+$10.25 today');
  });

  test('the scaled curve is preferred, then the raw one, then nothing', () => {
    const scaledCurve = [{ date: 'a', equity: 1 }];
    const rawCurve = [{ date: 'a', equity: 10 }];
    expect(
      tradingCardView(status({ display_divisor: 2 }), perf({ curve: rawCurve, curve_display: scaledCurve }), NOW)
        .curve,
    ).toBe(scaledCurve);
    expect(tradingCardView(status(), perf({ curve: rawCurve }), NOW).curve).toBe(rawCurve);
    expect(tradingCardView(status(), null, NOW).curve).toEqual([]);
  });

  test('with no equity anywhere the card counts trades instead', () => {
    expect(tradingCardView(status(), null, NOW).tradesLine).toBe('no trades yet today');
    expect(tradingCardView(status({ trades_today: 1 }), null, NOW).tradesLine).toBe('1 trade today');
    expect(tradingCardView(status({ trades_today: 3 }), null, NOW).tradesLine).toBe('3 trades today');
    expect(tradingCardView(status({ equity: 1 }), null, NOW).tradesLine).toBeNull();
  });

  test('the equity label follows the broker, not the mode', () => {
    expect(tradingCardView(status({ equity: 1 }), null, NOW).equityLabel).toBe('paper equity');
    expect(tradingCardView(status({ mode: 'live', broker: 'alpaca', equity: 1 }), null, NOW).equityLabel).toBe(
      'equity',
    );
  });
});

describe('positions and the last order (TradingCard.tsx:71-88)', () => {
  test('/perf positions are priced when a price is available', () => {
    const v = tradingCardView(
      status(),
      perf({ positions: { SPY: 2.5, GLD: 1 }, prices: { SPY: 400 } }),
      NOW,
    );
    expect(v.positionsLine).toBe('SPY S&P 500 2.5 ($1,000) · GLD Gold 1.0');
  });

  test('scaled position values come from the display map', () => {
    const v = tradingCardView(
      status({ display_divisor: 10 }),
      perf({ positions: { SPY: 2 }, prices: { SPY: 400 }, position_values_display: { SPY: 80 } }),
      NOW,
    );
    expect(v.positionsLine).toBe('SPY S&P 500 2.0 ($80)');
  });

  test('/status positions are the fallback, and nothing at all is null', () => {
    expect(
      tradingCardView(status({ positions: [{ symbol: 'QQQ', qty: 3, value: null }] }), null, NOW).positionsLine,
    ).toBe('QQQ Nasdaq-100 3');
    expect(tradingCardView(status(), null, NOW).positionsLine).toBeNull();
  });

  test('the last order reads as a sentence, with the side spelled out', () => {
    const v = tradingCardView(
      status({ last_order: { ts: iso(600_000), side: 'sell', qty: '1.5', symbol: 'SPY', value: 620.4 } }),
      null,
      NOW,
    );
    expect(v.lastOrderLine).toBe('last order sold 1.50 SPY S&P 500 (~$620) · 10m ago');
  });

  test('an unknown side is printed rather than guessed', () => {
    const v = tradingCardView(
      status({ last_order: { ts: iso(60_000), side: null, qty: null, symbol: null } }),
      null,
      NOW,
    );
    // The PWA renders `{lastOrderQty}` and `{symName(null)}` as empty nodes:
    // the separating spaces survive (four of them, as here), the word "null"
    // must not — which a template string would happily print.
    expect(v.lastOrderLine).toBe('last order    · just now');
  });
});

describe('strategy attribution (TradingCard.tsx:89-95,193-216)', () => {
  test('per-strategy returns carry their own sign and weight', () => {
    const v = tradingCardView(
      status(),
      perf({
        attribution: {
          strategies: {
            trend_rotation: { weight: 0.6, mode: 'live', targets: null, return_pct: 2.157 },
            multi_asset_trend: { weight: 0.4, mode: 'practice', targets: null, return_pct: -1.04 },
          },
          since: '2026-01-01',
          sessions: 10,
        },
      }),
      NOW,
    );
    expect(v.strategies).toEqual([
      { label: 'Trend rotation 60%', ret: { text: '+2.2%', positive: true }, practice: false },
      { label: 'Diversifier trend', ret: { text: '−1.0%', positive: false }, practice: true },
    ]);
  });

  test('/status second_strategy is the fallback, and {"mode":"off"} renders nothing', () => {
    expect(
      tradingCardView(status({ second_strategy: { mode: 'live', name: 'multi_asset_trend', weight: 0.25 } }), null, NOW)
        .secondStrategyLine,
    ).toBe('2 strategies · Diversifier trend 25%');
    expect(tradingCardView(status({ second_strategy: { mode: 'off' } }), null, NOW).secondStrategyLine).toBeNull();
    expect(tradingCardView(status(), null, NOW).secondStrategyLine).toBeNull();
  });

  test('attribution wins over the fallback when both are present', () => {
    const v = tradingCardView(
      status({ second_strategy: { mode: 'live', name: 'x' } }),
      perf({
        attribution: {
          strategies: { trend_rotation: { weight: 1, mode: 'live', targets: null, return_pct: 1 } },
          since: '',
          sessions: 1,
        },
      }),
      NOW,
    );
    expect(v.strategies).toHaveLength(1);
    expect(v.secondStrategyLine).toBeNull();
  });
});

describe('the footer line (TradingCard.tsx:218-242)', () => {
  test('a gated streak is a warning, in plain language', () => {
    const one = tradingCardView(status({ gated_streak: 1 }), null, NOW).footer;
    expect(one).toEqual([
      { text: 'risk rules have blocked the last 1 trade idea — investigate', tone: 'status-warn' },
    ]);
    expect(tradingCardView(status({ gated_streak: 2 }), null, NOW).footer[0].text).toContain('2 trade ideas');
    expect(tradingCardView(status({ gated_streak: 0 }), null, NOW).footer).toEqual([]);
  });

  test('last check prefers the timestamp, then the age, then says nothing', () => {
    expect(tradingCardView(status({ last_iteration: iso(120_000) }), null, NOW).footer[0].text).toBe(
      'last check 2m ago',
    );
    expect(tradingCardView(status({ last_tick_age_s: 30 }), null, NOW).footer[0].text).toBe('last check just now');
    expect(tradingCardView(status({ last_tick_age_s: 200 }), null, NOW).footer[0].text).toBe('last check 3m ago');
    expect(tradingCardView(status(), null, NOW).footer).toEqual([]);
  });

  test('a stale status says the check is overdue', () => {
    expect(tradingCardView(status({ status: 'stale' }), null, NOW).footer).toEqual([
      { text: 'check is overdue', tone: 'status-warn' },
    ]);
  });
});

describe('the equity sparkline (TradingCard.tsx:259-291)', () => {
  test('fewer than two points draws nothing', () => {
    expect(sparkline([])).toBeNull();
    expect(sparkline([{ date: 'a', equity: 1 }])).toBeNull();
  });

  test('the line spans the full width and is padded 3px top and bottom', () => {
    const spark = sparkline([
      { date: 'a', equity: 100 },
      { date: 'b', equity: 200 },
      { date: 'c', equity: 300 },
    ]);
    expect(spark?.path).toBe(`M0 33 L${SPARK_W / 2} 18 L${SPARK_W} 3`);
    expect(spark?.end).toEqual({ x: SPARK_W, y: 3 });
    expect(SPARK_H).toBe(36);
  });

  test('a flat curve sits on the baseline rather than dividing by zero', () => {
    const spark = sparkline([
      { date: 'a', equity: 50 },
      { date: 'b', equity: 50 },
    ]);
    expect(spark?.path).toBe(`M0 33 L${SPARK_W} 33`);
  });

  test('it is drawn at whatever width the card measures', () => {
    const spark = sparkline(
      [
        { date: 'a', equity: 1 },
        { date: 'b', equity: 2 },
      ],
      100,
      36,
    );
    expect(spark?.end.x).toBe(100);
  });

  test('the label always says Paper, as the PWA does (OQ-10)', () => {
    expect(
      sparklineLabel([
        { date: '2026-01-01', equity: 1 },
        { date: '2026-02-01', equity: 2 },
      ]),
    ).toBe('Paper equity, 2026-01-01 to 2026-02-01');
  });
});
