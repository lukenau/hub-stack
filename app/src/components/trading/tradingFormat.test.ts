// The Trading surface's computed copy. Every assertion here is a sentence the
// PWA renders (docs/inventory/trading.md §4), not an invented format.
import type {
  BlockedOrder,
  BlockedSymbol,
  ProposalAwaiting,
  TradingAdvisoryNote,
  TradingBudget,
  TradingEvent,
  TradingPerf,
  TradingSession,
  TradingStatus,
} from '../../lib/types';
import {
  activityRows,
  advisoryLines,
  blockedRowLine,
  blockedSummary,
  blockedView,
  expectationLine,
  fmtPct,
  guardrailsLine,
  killedHeader,
  losingDaysWarning,
  moveText,
  positionsView,
  proposalSubtitle,
  proposalTitle,
  rankPrefix,
  rankScoreText,
  resolvedLine,
  sessionDetail,
  showMoreLabel,
  statusStripView,
  titleCase,
  tradeLine,
  tripwireLine,
} from './tradingFormat';

const NOW = Date.parse('2026-09-11T15:00:00Z');

const status = (over: Partial<TradingStatus> = {}): TradingStatus => ({
  status: 'ok',
  mode: 'sim',
  halted: null,
  ...over,
});

const budget = (over: Partial<TradingBudget> = {}): TradingBudget => ({
  trades_today: 0,
  spent_today: 0,
  max_trades_per_day: 3,
  daily_limit: null,
  daily_limit_display: null,
  consecutive_losing_days: 0,
  consecutive_losing_days_stored: null,
  halt_at_losing_days: 3,
  breaker_mode: null,
  halted: false,
  ...over,
});

describe('statusStripView — the badge never overstates what the money is', () => {
  test('spindle reporting live with no broker is forced to PAPER, in the dryrun tone', () => {
    const v = statusStripView(status({ mode: 'live' }), null, NOW);
    expect(v.badge).toBe('PAPER');
    expect(v.tone.color).toBe('status-warn');
  });

  test('live WITH a broker is the only LIVE badge, and it wears the red tone', () => {
    const v = statusStripView(status({ mode: 'live', broker: 'alpaca' }), null, NOW);
    expect(v.badge).toBe('LIVE');
    expect(v.tone.color).toBe('status-down');
  });

  test('a broker whose name contains "paper" reads PAPER even in live mode', () => {
    expect(statusStripView(status({ mode: 'live', broker: 'alpaca-paper' }), null, NOW).badge).toBe(
      'PAPER',
    );
  });

  test('sim reads PRACTICE, dryrun reads PAPER', () => {
    expect(statusStripView(status({ mode: 'sim' }), null, NOW).badge).toBe('PRACTICE');
    expect(statusStripView(status({ mode: 'dryrun' }), null, NOW).badge).toBe('PAPER');
  });
});

describe('statusStripView — the health sentence', () => {
  test('running, with tick age in words rather than seconds', () => {
    const v = statusStripView(status({ last_tick_age_s: 240 }), null, NOW);
    expect(v.statusText).toBe('running · last check 4m ago');
    expect(v.dot).toBe('status-up');
    expect(v.statusColor).toBe('fg-3');
  });

  test('a tick under 90s reads "just now", never "0m ago"', () => {
    expect(statusStripView(status({ last_tick_age_s: 40 }), null, NOW).statusText).toBe(
      'running · last check just now',
    );
  });

  test('stale turns the sentence and the dot amber', () => {
    const v = statusStripView(status({ status: 'stale', last_tick_age_s: 4000 }), null, NOW);
    expect(v.statusText).toBe('check is overdue · last check 66m ago');
    expect(v.dot).toBe('status-warn');
    expect(v.statusColor).toBe('status-warn');
  });

  test('halted reads "paused" with a red dot', () => {
    const v = statusStripView(status({ halted: 'losing streak' }), null, NOW);
    expect(v.statusText).toBe('paused');
    expect(v.dot).toBe('status-down');
  });

  test('last_iteration wins over tick age, and next_tick appends the forward-looking check', () => {
    const v = statusStripView(
      status({
        last_iteration: '2026-09-11T14:50:00Z',
        last_tick_age_s: 40,
        next_tick: '2026-09-11T15:30:00Z',
      }),
      null,
      NOW,
    );
    expect(v.statusText).toBe('running · last check 10m ago · next check in 30m');
  });
});

describe('statusStripView — the trades label prefers the NY-keyed budget', () => {
  test('budget counters win over spindle’s UTC ones', () => {
    const v = statusStripView(
      status({ trades_today: 9, spent_today: 9999 }),
      budget({ trades_today: 2, spent_today: 1400 }),
      NOW,
    );
    expect(v.tradesLabel).toBe('2 trades today · spent $1,400');
  });

  test('one trade is singular, and a zero spend is not printed', () => {
    expect(
      statusStripView(status(), budget({ trades_today: 1, spent_today: 0 }), NOW).tradesLabel,
    ).toBe('1 trade today');
  });

  test('a closed market says so instead of counting to zero', () => {
    expect(statusStripView(status(), budget({ market_day: false }), NOW).tradesLabel).toBe(
      'market closed',
    );
  });

  test('zero trades on an open day reads "no trades yet today"', () => {
    expect(statusStripView(status(), budget({ trades_today: 0 }), NOW).tradesLabel).toBe(
      'no trades yet today',
    );
  });

  test('nothing at all to report leaves the label off entirely', () => {
    expect(statusStripView(status(), null, NOW).tradesLabel).toBeNull();
  });

  test('spend is divided by the display divisor, like every other money field', () => {
    const v = statusStripView(
      status({ display_divisor: 20 }),
      budget({ trades_today: 1, spent_today: 2000 }),
      NOW,
    );
    expect(v.tradesLabel).toBe('1 trade today · spent $100');
  });
});

describe('statusStripView — the second strategy', () => {
  test('a practice strategy is named as practice', () => {
    expect(
      statusStripView(
        status({ second_strategy: { mode: 'practice', name: 'multi_asset_trend' } }),
        null,
        NOW,
      ).secondStrategy,
    ).toBe('Diversifier trend in practice');
  });

  test('a live second strategy is just a count', () => {
    expect(
      statusStripView(
        status({ second_strategy: { mode: 'live', name: 'multi_asset_trend' } }),
        null,
        NOW,
      ).secondStrategy,
    ).toBe('2 strategies');
  });

  test('mode "off" renders nothing — the wire shape carries no name either', () => {
    expect(
      statusStripView(status({ second_strategy: { mode: 'off' } }), null, NOW).secondStrategy,
    ).toBeNull();
  });
});

describe('guardrails', () => {
  test('the counts line, in all four shapes', () => {
    expect(guardrailsLine(budget({ market_day: false }))).toBe('market closed — no trading today');
    expect(guardrailsLine(budget({ trades_today: 2 }))).toBe('2 of 3 trades used today');
    expect(guardrailsLine(budget())).toBe('no trades yet today · it will make at most 3');
    expect(guardrailsLine(budget({ max_trades_per_day: null, trades_today: 2 }))).toBe(
      '2 trades today',
    );
    expect(guardrailsLine(budget({ max_trades_per_day: null }))).toBe('no trades yet today');
  });

  test('silent on an ordinary losing day — the warning is for one day out', () => {
    expect(losingDaysWarning(budget({ consecutive_losing_days: 1 }))).toBeNull();
    expect(losingDaysWarning(budget({ consecutive_losing_days: 2 }))).toBe(
      '2 material losing days in a row — one more and it pauses itself until you resume it.',
    );
  });

  test('it reads the RECOMPUTED streak, never the lagging stored counter', () => {
    expect(
      losingDaysWarning(budget({ consecutive_losing_days: 0, consecutive_losing_days_stored: 2 })),
    ).toBeNull();
  });

  test('while halted the status strip owns the story — no second banner', () => {
    expect(losingDaysWarning(budget({ consecutive_losing_days: 2, halted: true }))).toBeNull();
  });

  test('no configured breaker means no warning at any streak', () => {
    expect(
      losingDaysWarning(budget({ consecutive_losing_days: 9, halt_at_losing_days: null })),
    ).toBeNull();
  });
});

describe('blocked history', () => {
  const order = (over: Partial<BlockedOrder> = {}): BlockedOrder => ({
    ts: '2026-09-08T14:00:00Z',
    day: '2026-09-08',
    symbol: 'DBC',
    side: 'buy',
    qty: 3,
    reason_plain: 'the price quote was too old to trust',
    value: 2000,
    value_display: 100,
    ...over,
  });
  const sym = (over: Partial<BlockedSymbol> = {}): BlockedSymbol => ({
    days: [
      { day: '2026-09-08', reason_plain: 'the price quote was too old to trust' },
      { day: '2026-09-09', reason_plain: "cash wasn't free yet — usually a sell still filling" },
    ],
    resolved_on: null,
    count: 2,
    ...over,
  });

  test('a tripwire is two days running AND still unresolved', () => {
    const v = blockedView({
      blocked: [order()],
      blocked_days: { DBC: sym(), GLD: sym({ resolved_on: '2026-09-10' }), IEF: sym({ count: 1 }) },
    });
    expect(v.tripwires.map(([s]) => s)).toEqual(['DBC']);
    expect(v.settled.map(([s]) => s)).toEqual(['GLD']);
  });

  test('the day range collapses to one date when everything fell on one day', () => {
    expect(blockedView({ blocked: [order(), order()] }).blockedRange).toBe('Sep 8');
    expect(
      blockedView({ blocked: [order(), order({ day: '2026-09-09' })] }).blockedRange,
    ).toBe('Sep 8–Sep 9');
  });

  test('the verdict line is singular for one order and names the settle date', () => {
    const one = blockedView({
      blocked: [order()],
      blocked_days: { GLD: sym({ resolved_on: '2026-09-10' }) },
    });
    expect(blockedSummary(one)).toBe(
      '1 order was blocked on Sep 8, and every one went in on Sep 10.',
    );
    expect(blockedSummary(blockedView({ blocked: [order(), order()] }))).toBe(
      '2 orders were blocked on Sep 8.',
    );
  });

  test('each blocked day carries its OWN reason — that is the point of the card', () => {
    expect(tripwireLine('DBC', sym())).toBe(
      "DBC Commodities was blocked 2 days running — the price quote was too old to trust on Tuesday, then cash wasn't free yet — usually a sell still filling on Wednesday. No order for it has gone in since.",
    );
  });

  test('a row shows the display-scaled notional, never the raw one', () => {
    expect(blockedRowLine(order())).toBe(
      'DBC Commodities ~$100 · the price quote was too old to trust · Sep 8',
    );
    expect(blockedRowLine(order({ value_display: null }))).toBe(
      'DBC Commodities · the price quote was too old to trust · Sep 8',
    );
  });
});

describe('positions', () => {
  const perf = (over: Partial<TradingPerf> = {}): TradingPerf => ({
    curve: [],
    day_pnl: null,
    total_pnl: null,
    equity: 1000,
    cash: 100,
    positions: { SPY: 10, GLD: 2 },
    prices: { SPY: 50, GLD: 100 },
    ...over,
  });

  test('rows are biggest-first with the share of the account', () => {
    const v = positionsView(perf());
    expect(v.rows.map((r) => [r.sym, r.val, r.share])).toEqual([
      ['SPY', 500, 50],
      ['GLD', 200, 20],
    ]);
    expect(v.cash).toBe(100);
  });

  test('the display divisor scales values, cash and therefore nothing else', () => {
    const v = positionsView(
      perf({ display_divisor: 10, equity_display: 100, cash_display: 10 }),
    );
    expect(v.rows[0].val).toBe(50);
    expect(v.rows[0].share).toBe(50);
    expect(v.cash).toBe(10);
  });

  test('an unpriced leg keeps its share count instead of claiming a dollar value', () => {
    const v = positionsView(perf({ prices: { SPY: 50 } }));
    const gld = v.rows.find((r) => r.sym === 'GLD')!;
    expect(gld.val).toBeNull();
    expect(gld.share).toBeNull();
  });

  test('ranks group in arrival order, and targets only mark what is not held', () => {
    const v = positionsView(perf(), {
      asof: 0,
      equity: 1000,
      cash: 100,
      positions: {},
      targets: [
        { symbol: 'SPY', weight: 0.5 },
        { symbol: 'TLT', weight: 0.5 },
      ],
      ranks: [
        { strategy: 'trend_rotation', symbol: 'SPY', thesis: 'a', score: 0.1 },
        { strategy: 'multi_asset_trend', symbol: 'GLD', thesis: 'b', score: -0.02 },
        { strategy: 'trend_rotation', symbol: 'QQQ', thesis: 'c', score: 0.05 },
      ],
    });
    expect(v.rankGroups.map((g) => g.strategy)).toEqual(['trend_rotation', 'multi_asset_trend']);
    expect(v.rankGroups[0].rows.map((r) => r.symbol)).toEqual(['SPY', 'QQQ']);
    expect(v.targeted.has('TLT')).toBe(true);
    expect(rankPrefix(v.held.has('SPY'), false, 0)).toBe('●');
    expect(rankPrefix(false, v.targeted.has('TLT'), 1)).toBe('◌');
    expect(rankPrefix(false, false, 2)).toBe('3.');
  });

  test('a score reads as a percent with the signal it measures, minus sign U+2212', () => {
    expect(rankScoreText({ strategy: 'trend_rotation', score: 0.1234 })).toBe('+12.3% momentum');
    expect(rankScoreText({ strategy: 'multi_asset_trend', score: -0.02 })).toBe('−2.0% vs SMA');
  });
});

describe('session log', () => {
  const session = (over: Partial<TradingSession> = {}): TradingSession => ({
    day: '2026-09-08',
    verb: 'traded',
    ticks: 1,
    placed: 2,
    refused: 0,
    reasons: [],
    equity_open: 1000,
    equity_close: 1100,
    ...over,
  });

  test('counts lead, and the verb gloss only fills in when there are none', () => {
    expect(sessionDetail(session())).toBe('2 orders');
    expect(sessionDetail(session({ placed: 1, refused: 3 }))).toBe('1 order · 3 refused');
    expect(sessionDetail(session({ verb: 'held', placed: 0 }))).toBe('nothing to change');
    expect(sessionDetail(session({ verb: 'frozen', placed: 0 }))).toBe(
      'paused — it kept wanting to act and couldn’t',
    );
  });

  test('a trade line is ET, strips a trailing .00, and hides a filled status', () => {
    expect(
      tradeLine({
        ts: '2026-09-08T19:58:00Z',
        symbol: 'EEM',
        side: 'sell',
        qty: 5,
        price: 42.1,
        status: 'filled',
        value: 4210,
        value_display: 210,
      }),
    ).toBe('3:58 PM ET · sell 5 EEM @ $42.10 · $210');
  });

  test('an unfilled status is shown, and the raw value is used when there is no display one', () => {
    expect(
      tradeLine({
        ts: '2026-09-08T19:58:00Z',
        symbol: 'EEM',
        side: 'buy',
        qty: 5.7657,
        price: null,
        status: 'pending_new',
        value: 249,
        value_display: null,
      }),
    ).toBe('3:58 PM ET · buy 5.77 EEM · $249 · pending_new');
  });

  test('a move is signed with U+2212 and always two decimals', () => {
    expect(moveText(12.5)).toBe('+$12.50');
    expect(moveText(-12.5)).toBe('−$12.50');
  });
});

describe('trading activity', () => {
  const event = (over: Partial<TradingEvent> = {}): TradingEvent => ({
    ts: 1757000000,
    title: 'Sold 5.7570 EEM',
    status: 'accepted',
    ...over,
  });
  const perf: TradingPerf = {
    curve: [],
    day_pnl: null,
    total_pnl: null,
    prices: { EEM: 43 },
  };

  test('the feed is reversed to newest-first and skipped receipts are dropped', () => {
    const rows = activityRows([
      event({ ts: 1, title: 'Bought 1.0000 SPY' }),
      event({ ts: 2, title: 'Advisory: skipped', status: 'skipped' }),
      event({ ts: 3, title: 'Sold 2.0000 GLD' }),
    ]);
    expect(rows.map((r) => r.ts)).toEqual([3, 1]);
  });

  test('an order title becomes a sentence with two-decimal quantity and the fund name', () => {
    const [row] = activityRows([event()], perf);
    expect(row.title).toBe('Sold 5.76 EEM Emerging Mkts');
    expect(row.value).toBe('(~$248)');
  });

  test('the approximate value is divided by the display divisor', () => {
    const [row] = activityRows([event()], { ...perf, display_divisor: 10 });
    expect(row.value).toBe('(~$25)');
  });

  test('a non-order title is rendered raw, with no phantom value', () => {
    const [row] = activityRows([event({ title: 'Data guard: no-op iteration', status: 'guard' })], perf);
    expect(row.title).toBe('Data guard: no-op iteration');
    expect(row.value).toBeNull();
  });

  test('pending_new is the "still filling" flag', () => {
    expect(activityRows([event({ status: 'pending_new' })], perf)[0].filling).toBe(true);
  });

  test('an advisory row joins its note by the UTC day of the event', () => {
    const note: TradingAdvisoryNote = {
      ts: '2026-09-04T18:00:00Z',
      status: 'applied',
      reason: null,
      model: 'deepseek',
      provider: null,
      action: 'tilt',
      confidence: 0.62,
      rationale: 'momentum broadened',
      would_apply: [{ symbol: 'SPY', weight: 0.6 }],
    };
    const day = new Date(1757000000 * 1000).toISOString().slice(0, 10);
    const [row] = activityRows([event({ title: 'Advisory: applied' })], perf, { [day]: note });
    expect(row.advisory).toBe(note);
    expect(activityRows([event()], perf, { [day]: note })[0].advisory).toBeNull();
  });

  test('the advisory expansion states confidence, and flags anything not applied', () => {
    const base: TradingAdvisoryNote = {
      ts: '2026-09-04T18:00:00Z',
      status: 'applied',
      reason: 'ok',
      model: 'deepseek',
      provider: null,
      action: 'tilt',
      confidence: 0.62,
      rationale: 'momentum broadened',
      would_apply: [{ symbol: 'SPY', weight: 0.6 }],
    };
    expect(advisoryLines(base)).toEqual({
      head: 'tilt · confidence 62%',
      rationale: '“momentum broadened”',
      wouldApply: 'would have set: SPY S&P 500 60%',
      meta: 'deepseek · ok',
    });
    expect(advisoryLines({ ...base, status: 'rejected' }).head).toBe(
      'tilt · confidence 62% · rejected — not applied',
    );
  });

  test('a note with no action falls back to its status, never the string "null"', () => {
    const head = advisoryLines({
      ts: '',
      status: 'skipped',
      reason: null,
      model: null,
      provider: null,
      action: null,
      confidence: null,
      rationale: null,
      would_apply: null,
    });
    expect(head.head).toBe('skipped');
    expect(head.meta).toBe('');
  });

  test('the show-more label counts what is hidden', () => {
    expect(showMoreLabel(9, false)).toBe('show 4 more ▾');
    expect(showMoreLabel(9, true)).toBe('show fewer ▴');
  });
});

describe('exposure formatting', () => {
  test('two decimals under 10%, one above — small names would otherwise read 0%', () => {
    expect(fmtPct(0.37)).toBe('0.37%');
    expect(fmtPct(9.994)).toBe('9.99%');
    expect(fmtPct(10)).toBe('10.0%');
  });

  test('ALLCAPS issuer names are title-cased, keeping short all-caps words', () => {
    expect(titleCase('TAIWAN SEMICONDUCTOR MANUFACTURING')).toBe(
      'Taiwan Semiconductor Manufacturing',
    );
    expect(titleCase('SK HYNIX')).toBe('SK Hynix');
    expect(titleCase(null)).toBe('');
  });
});

describe('proposal ledger', () => {
  const proposal = (over: Partial<ProposalAwaiting> = {}): ProposalAwaiting => ({
    id: 'p1',
    ts: null,
    param: 'drift_band',
    param_plain: 'Drift band — how far a sleeve may wander before it rebalances',
    status: 'awaiting',
    current: 3,
    proposed: 4,
    change_plain: '3 → 4',
    reasoning: 'fewer round trips',
    expectation: {
      metric: 'turnover',
      metric_plain: 'turnover',
      direction: 'decrease',
      horizon_days: 20,
    },
    confidence: 0.6,
    survived: [],
    decision_id: null,
    ...over,
  });

  test('the em dash splits the setting from its description', () => {
    expect(proposalTitle(proposal().param_plain)).toBe('Drift band');
    expect(proposalSubtitle(proposal().param_plain)).toBe(
      'how far a sleeve may wander before it rebalances',
    );
    expect(proposalSubtitle('Drift band')).toBeNull();
  });

  test('a falsifiable expectation reads in words, with its horizon and confidence', () => {
    expect(expectationLine(proposal())).toBe(
      'expects turnover to shrink within 20 trading days · confidence 60%',
    );
    expect(
      expectationLine(
        proposal({
          expectation: { metric: 'x', metric_plain: 'hit rate', direction: 'increase', horizon_days: null },
          confidence: null,
        }),
      ),
    ).toBe('expects hit rate to grow');
  });

  test('killed and resolved counts are singular-aware', () => {
    expect(killedHeader(1, false)).toBe("1 proposal didn't make it — kept on record ▾");
    expect(killedHeader(3, true)).toBe("3 proposals didn't make it — kept on record ▴");
    expect(resolvedLine(1)).toBe(
      '1 proposal has been answered — they move to the scorecard once graded',
    );
    expect(resolvedLine(2)).toBe(
      '2 proposals have been answered — they move to the scorecard once graded',
    );
  });
});
