// The Trading cards as they actually render: which state each card lands in,
// what it says there, and the two mappers whose output is only visible through
// a card (src/shared/exposure.ts and src/shared/sessions.ts).
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import type {
  TradingDecisionDay,
  TradingEvent,
  TradingExposure,
  TradingLog,
  TradingPerf,
  TradingProposals,
  TradingSession,
} from '../../lib/types';
import { BlockedCard } from './BlockedCard';
import { DecisionsCard } from './DecisionsCard';
import { ExposureCard } from './ExposureCard';
import { GuardrailsStrip } from './GuardrailsStrip';
import { PositionsCard } from './PositionsCard';
import { ProposalLedger } from './ProposalLedger';
import { SessionLog } from './SessionLog';
import { TradingActivity } from './TradingActivity';

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

const colorOf = (r: TestRenderer.ReactTestRenderer, line: string) => {
  const node = r.root
    .findAllByType(Text)
    .find((n) => flat(n.props.children) === line);
  if (!node) throw new Error(`no line ${JSON.stringify(line)}`);
  return StyleSheet.flatten(node.props.style).color as string;
};

/** The outermost pressable whose rendered text contains `label`. */
const button = (r: TestRenderer.ReactTestRenderer, label: string) =>
  r.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.findAllByType(Text).some((t) => flat(t.props.children).includes(label)),
  )[0];

const press = (r: TestRenderer.ReactTestRenderer, label: string) =>
  act(() => {
    button(r, label).props.onPress();
  });

// --- GuardrailsStrip --------------------------------------------------------

describe('GuardrailsStrip', () => {
  const budget: TradingLog['budget'] = {
    market_day: true,
    trades_today: 1,
    spent_today: 200,
    max_trades_per_day: 3,
    daily_limit: null,
    daily_limit_display: null,
    consecutive_losing_days: 0,
    consecutive_losing_days_stored: null,
    halt_at_losing_days: 3,
    breaker_mode: null,
    halted: false,
  };

  test('no budget, no strip — the log query can resolve to null', () => {
    expect(render(<GuardrailsStrip budget={null} />).toJSON()).toBeNull();
  });

  test('the count line stands alone until the breaker is one day away', () => {
    const quiet = render(<GuardrailsStrip budget={budget} />);
    expect(texts(quiet)).toEqual(['1 of 3 trades used today']);

    const loud = render(<GuardrailsStrip budget={{ ...budget, consecutive_losing_days: 2 }} />);
    expect(texts(loud)).toContain(
      '2 material losing days in a row — one more and it pauses itself until you resume it.',
    );
  });
});

// --- BlockedCard ------------------------------------------------------------

describe('BlockedCard', () => {
  const log = (over: Partial<TradingLog> = {}): TradingLog => ({
    generated_at: null,
    blocked: [],
    blocked_days: {},
    blocked_by_reason: null,
    budget: null,
    sessions: null,
    decisions: null,
    ...over,
  });
  const order = {
    ts: '2026-09-08T14:00:00Z',
    day: '2026-09-08',
    symbol: 'DBC',
    side: 'sell',
    qty: 3,
    reason_plain: 'the price quote was too old to trust',
    value: 2000,
    value_display: 100,
  };

  test('a null log is one quiet line that promises it comes back', () => {
    const r = render(<BlockedCard log={null} />);
    expect(texts(r)).toEqual([
      'the blocked-order history isn’t available right now — it comes back on its own',
    ]);
  });

  test('a halt short-circuits every check, so the card refuses to claim "nothing blocked"', () => {
    const r = render(
      <BlockedCard
        log={log({
          budget: { ...({} as NonNullable<TradingLog['budget']>), halted: true },
          blocked: [],
        })}
      />,
    );
    const t = texts(r);
    expect(t).toContain(
      'It’s paused, so nothing got as far as being checked — anything behind the pause won’t show until it resumes.',
    );
    expect(t.some((s) => s.startsWith('Nothing blocked this week'))).toBe(false);
  });

  test('an empty week says every order went through', () => {
    expect(texts(render(<BlockedCard log={log()} />))).toContain(
      'Nothing blocked this week — every order it wanted went through.',
    );
  });

  test('all-resolved history leads with the verdict and hides the detail behind a toggle', () => {
    const r = render(
      <BlockedCard
        log={log({
          blocked: [order],
          blocked_days: {
            DBC: {
              days: [
                { day: '2026-09-08', reason_plain: 'the price quote was too old to trust' },
                { day: '2026-09-09', reason_plain: 'the price quote was too old to trust' },
              ],
              resolved_on: '2026-09-10',
              count: 2,
            },
          },
        })}
      />,
    );
    expect(texts(r)).toContain('Nothing outstanding.');
    expect(texts(r)).toContain('1 order was blocked on Sep 8, and every one went in on Sep 10.');
    expect(texts(r)).toContain('what was blocked ▾');
    expect(texts(r).some((s) => s.startsWith('DBC Commodities ~$100'))).toBe(false);

    press(r, 'what was blocked ▾');
    expect(texts(r)).toContain(
      'DBC Commodities ~$100 · the price quote was too old to trust · Sep 8',
    );
  });

  test('an unresolved tripwire is an alert, with the per-order rows below it', () => {
    const r = render(
      <BlockedCard
        log={log({
          blocked: [order],
          blocked_days: {
            DBC: {
              days: [
                { day: '2026-09-08', reason_plain: 'the price quote was too old to trust' },
                { day: '2026-09-09', reason_plain: 'trading is paused' },
              ],
              resolved_on: null,
              count: 2,
            },
          },
        })}
      />,
    );
    const t = texts(r);
    expect(t).toContain(
      'DBC Commodities was blocked 2 days running — the price quote was too old to trust on Tuesday, then trading is paused on Wednesday. No order for it has gone in since.',
    );
    expect(t).toContain('Couldn’t sell DBC Commodities (~$100)');
    expect(t).toContain(
      'it decides once a day, so a blocked order isn’t retried until the next one',
    );
    expect(t).not.toContain('Nothing outstanding.');
  });
});

// --- SessionLog -------------------------------------------------------------

describe('SessionLog', () => {
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

  test('no sessions, no card', () => {
    expect(render(<SessionLog sessions={[]} />).toJSON()).toBeNull();
  });

  test('newest first, with the close-to-close move at display scale', () => {
    const r = render(
      <SessionLog
        sessions={[
          session({ day: '2026-09-08', equity_close: 1000 }),
          session({ day: '2026-09-09', equity_close: 1200 }),
        ]}
        perf={{ curve: [], day_pnl: null, total_pnl: null, display_divisor: 10 }}
      />,
    );
    const t = texts(r);
    expect(t.indexOf('Wed, Sep 9')).toBeLessThan(t.indexOf('Tue, Sep 8'));
    expect(t).toContain('+$20.00');
    // The first session has no prior close to measure from: an honest gap.
    expect(t.filter((s) => s.startsWith('+$')).length).toBe(1);
  });

  test('only a clean session earns green or red — a frozen one stays grey', () => {
    const first = session({ day: '2026-09-08', equity_close: 1000 });
    const clean = render(<SessionLog sessions={[first, session({ day: '2026-09-09', equity_close: 1200 })]} />);
    const frozen = render(
      <SessionLog
        sessions={[first, session({ day: '2026-09-09', verb: 'frozen', placed: 0, equity_close: 1200 })]}
      />,
    );
    const gloss = ' — paused — it kept wanting to act and couldn’t';
    expect(texts(frozen)).toContain(`Wed, Sep 9 frozen${gloss}`);
    // Same +$200 move, two colours: green only for the session that traded.
    expect(colorOf(clean, '+$200.00')).not.toBe(colorOf(frozen, '+$200.00'));
    expect(colorOf(frozen, '+$200.00')).toBe(colorOf(frozen, gloss));
  });

  test('a session with trades expands to the ET trade lines', () => {
    const r = render(
      <SessionLog
        sessions={[
          session({
            trades: [
              {
                ts: '2026-09-08T19:58:00Z',
                symbol: 'EEM',
                side: 'sell',
                qty: 5,
                price: 42.1,
                status: 'filled',
                value: 4210,
                value_display: 210,
              },
            ],
          }),
        ]}
      />,
    );
    expect(texts(r).some((s) => s.includes('3:58 PM ET'))).toBe(false);
    press(r, 'traded');
    expect(texts(r)).toContain('3:58 PM ET · sell 5 EEM @ $42.10 · $210');
  });
});

// --- DecisionsCard ----------------------------------------------------------

describe('DecisionsCard', () => {
  const day = (over: Partial<TradingDecisionDay> = {}): TradingDecisionDay => ({
    day: '2026-09-08',
    strategies: {
      trend_rotation: { weight: 0.5, enabled: true, targets: { SPY: 0.6, GLD: 0.4 } },
      multi_asset_trend: { weight: 0.5, enabled: false, targets: null },
    },
    changed: { added: [], dropped: [] },
    ...over,
  });

  test('no decision days, no card', () => {
    expect(render(<DecisionsCard decisions={[]} />).toJSON()).toBeNull();
  });

  test('where each strategy stands now, with a practice one marked and cash spelled out', () => {
    const r = render(<DecisionsCard decisions={[day()]} />);
    const t = texts(r);
    expect(t).toContain('Trend rotation');
    expect(t).toContain('Diversifier trend · practice');
    expect(t).toContain('50% of book');
    expect(t).toContain('SPY S&P 500');
    expect(t).toContain('60%');
    expect(t).toContain('nothing — sitting in cash');
  });

  test('quiet sessions are counted, not printed', () => {
    const r = render(<DecisionsCard decisions={[day({ day: '2026-09-07' }), day()]} />);
    expect(texts(r)).toContain('Changes · last 2 sessions');
    expect(texts(r)).toContain('nothing entered or left the book — 2 sessions unchanged');
  });

  test('a day that moved is listed, and the rest are one tail line', () => {
    const r = render(
      <DecisionsCard
        decisions={[
          day({ day: '2026-09-07' }),
          day({ day: '2026-09-08', changed: { added: ['TLT'], dropped: ['GLD'] } }),
        ]}
      />,
    );
    const t = texts(r);
    expect(t).toContain('Tue, Sep 8');
    expect(t).toContain('+ TLT Long Treasuries');
    expect(t).toContain('− GLD Gold');
    expect(t).toContain('the other 1 session held steady');
  });
});

// --- PositionsCard ----------------------------------------------------------

describe('PositionsCard', () => {
  const perf = (over: Partial<TradingPerf> = {}): TradingPerf => ({
    curve: [],
    day_pnl: null,
    total_pnl: null,
    equity: 1000,
    cash: 100,
    positions: { SPY: 10 },
    prices: { SPY: 50 },
    ...over,
  });

  test('nothing held and no cash figure, no card', () => {
    expect(
      render(<PositionsCard perf={perf({ positions: {}, cash: undefined })} />).toJSON(),
    ).toBeNull();
  });

  test('holdings carry dollars and share of the account, with cash on its own row', () => {
    const t = texts(render(<PositionsCard perf={perf()} />));
    expect(t).toContain('What it holds');
    expect(t).toContain('SPY S&P 500');
    expect(t).toContain('$500 · 50%');
    expect(t).toContain('Cash on hand');
    expect(t).toContain('$100');
  });

  test('an unpriceable leg reads in shares, never as a dollar zero', () => {
    const t = texts(render(<PositionsCard perf={perf({ positions: { GLD: 3 }, prices: {} })} />));
    expect(t).toContain('3.0 shares');
  });

  test('the strategy split names practice separately from a weighted strategy', () => {
    const t = texts(
      render(
        <PositionsCard
          perf={perf({
            attribution: {
              strategies: {
                trend_rotation: { weight: 0.5, mode: 'live', targets: { SPY: 1 }, return_pct: 2.157 },
                multi_asset_trend: {
                  weight: 0.5,
                  mode: 'practice',
                  targets: null,
                  return_pct: -1.2,
                },
              },
              since: '2026-08-01',
              sessions: 20,
            },
          })}
        />,
      ),
    );
    expect(t).toContain('Trend rotation · 50% of the account');
    expect(t).toContain('+2.2%');
    expect(t).toContain('practice');
    expect(t).toContain('−1.2%');
    expect(t).toContain('SPY S&P 500 100%');
    expect(t).toContain("each strategy's own picks, marked at close · since Aug 1");
  });

  test('no /explain yet degrades to a line, never an error', () => {
    expect(texts(render(<PositionsCard perf={perf()} />))).toContain(
      "no decision cycle yet today — what it's watching appears after the first one",
    );
  });

  test('what it is watching marks held and targeted rows, and a tap opens the thesis', () => {
    const r = render(
      <PositionsCard
        perf={perf()}
        explain={{
          asof: 0,
          equity: 1000,
          cash: 100,
          positions: {},
          targets: [{ symbol: 'TLT', weight: 0.4 }],
          ranks: [
            { strategy: 'trend_rotation', symbol: 'SPY', thesis: 'leading the pack', score: 0.12 },
            { strategy: 'trend_rotation', symbol: 'TLT', thesis: 'bid on duration', score: 0.04 },
          ],
        }}
      />,
    );
    const t = texts(r);
    expect(t).toContain('● SPY S&P 500');
    expect(t).toContain('◌ TLT Long Treasuries');
    expect(t).toContain('+12.0% momentum');
    expect(t).not.toContain('leading the pack');

    press(r, '● SPY S&P 500');
    expect(texts(r)).toContain('leading the pack');
  });
});

// --- TradingActivity --------------------------------------------------------

describe('TradingActivity', () => {
  const event = (over: Partial<TradingEvent> = {}): TradingEvent => ({
    ts: 1757000000,
    title: 'Sold 5.7570 EEM',
    status: 'accepted',
    ...over,
  });

  test('a feed of nothing but skipped advisories renders nothing at all', () => {
    expect(
      render(
        <TradingActivity events={[event({ title: 'Advisory: skipped', status: 'skipped' })]} />,
      ).toJSON(),
    ).toBeNull();
  });

  test('orders read as sentences with an approximate value at today’s price', () => {
    const t = texts(
      render(
        <TradingActivity
          events={[event()]}
          perf={{ curve: [], day_pnl: null, total_pnl: null, prices: { EEM: 43 } }}
        />,
      ),
    );
    expect(t).toContain('Sold 5.76 EEM Emerging Mkts (~$248)');
    expect(t).toContain("~$ = at today's price · practice account");
  });

  test('only five rows show until the show-more toggle is tapped', () => {
    const events = Array.from({ length: 7 }, (_, i) =>
      event({ ts: 1757000000 + i, title: `Bought ${i + 1}.0000 SPY` }),
    );
    const r = render(<TradingActivity events={events} />);
    expect(texts(r)).toContain('show 2 more ▾');
    expect(texts(r)).not.toContain('Bought 1.00 SPY S&P 500');

    press(r, 'show 2 more ▾');
    expect(texts(r)).toContain('Bought 1.00 SPY S&P 500');
    expect(texts(r)).toContain('show fewer ▴');
  });

  test('an advisory row expands to the advisor’s own output', () => {
    const day = new Date(1757000000 * 1000).toISOString().slice(0, 10);
    const r = render(
      <TradingActivity
        events={[event({ title: 'Advisory: applied' })]}
        advisory={{
          [day]: {
            ts: '',
            status: 'applied',
            reason: 'scheduled',
            model: 'deepseek',
            provider: null,
            action: 'tilt',
            confidence: 0.62,
            rationale: 'momentum broadened',
            would_apply: [{ symbol: 'SPY', weight: 0.6 }],
          },
        }}
      />,
    );
    expect(texts(r)).not.toContain('“momentum broadened”');
    press(r, 'Advisory: applied');
    const t = texts(r);
    expect(t).toContain('tilt · confidence 62%');
    expect(t).toContain('“momentum broadened”');
    expect(t).toContain('would have set: SPY S&P 500 60%');
    expect(t).toContain('deepseek · scheduled');
  });

  test('a pending order says it is still filling', () => {
    expect(texts(render(<TradingActivity events={[event({ status: 'pending_new' })]} />))).toContain(
      'Sold 5.76 EEM Emerging Mkts · still filling',
    );
  });
});

// --- ExposureCard -----------------------------------------------------------

describe('ExposureCard', () => {
  const exposure = (over: Partial<TradingExposure> = {}): TradingExposure => ({
    generated_at: null,
    equity: 1000,
    book: [
      {
        ticker: 'NVDA',
        name: 'NVIDIA CORP',
        book_pct: 1.7,
        via: [{ etf: 'QQQ', contrib_pct: 1.7, weight_pct: 8.6 }],
      },
    ],
    per_etf: {
      QQQ: {
        position_pct_of_book: 20,
        as_of: '2026-09-08',
        top10: [{ ticker: 'AAPL', name: 'APPLE INC', weight_pct: 8.6 }],
        names: 100,
        fund_pct: 92.4,
        max_name_pct: 1.7,
        in_top: 1,
      },
    },
    non_equity: [{ etf: 'SGOV', describes: 'cash', position_pct_of_book: 25 }],
    coverage: { shown: 1, names: 100, shown_pct: 1.7, explained_pct: 12 },
    notes: [],
    ...over,
  });

  test('no exposure payload, no card', () => {
    expect(render(<ExposureCard exposure={null} />).toJSON()).toBeNull();
  });

  test('the book is ONE ranked list — a 25% cash sleeve outranks a 20% equity one', () => {
    const r = render(<ExposureCard exposure={exposure()} />);
    const t = texts(r);
    expect(t).toContain('The book · 2 sleeves');
    expect(t.indexOf('SGOV T-Bills (cash) cash')).toBeLessThan(t.indexOf('QQQ Nasdaq-100'));
    expect(t).toContain('25% of book');
  });

  test('the ranked single-stock list ships with its coverage and its own percentages', () => {
    const r = render(<ExposureCard exposure={exposure()} />);
    const t = texts(r);
    expect(t).toContain('Biggest single stocks · top 1');
    expect(t).toContain('these 1 names are 1.70% of the book — the rest sits in the sleeves above');
    expect(t).toContain('Nvidia Corp NVDA');

    press(r, 'Nvidia Corp NVDA');
    expect(texts(r)).toContain('via QQQ · 8.60% of fund → 1.70% of book');
  });

  test('a held sleeve that reaches none of the rows explains itself rather than vanishing', () => {
    const e = exposure();
    const r = render(
      <ExposureCard
        exposure={{
          ...e,
          book: [],
          per_etf: { QQQ: { ...e.per_etf.QQQ, in_top: 0, max_name_pct: 0.37 } },
        }}
      />,
    );
    // book is empty, so the single-stock block (and its note) is gone entirely.
    expect(texts(r).some((s) => s.startsWith('Biggest single stocks'))).toBe(false);

    const withBook = render(
      <ExposureCard
        exposure={{ ...e, per_etf: { QQQ: { ...e.per_etf.QQQ, in_top: 0, max_name_pct: 0.37 } } }}
      />,
    );
    expect(texts(withBook)).toContain(
      'QQQ Nasdaq-100 is 20% of the book but reaches none of these rows: its 100 largest holdings are spread thin, so its biggest single name is only 0.37% of the book. Open it below to see inside.',
    );
  });

  test('each ETF opens to its own top ten, in FUND weights', () => {
    const r = render(<ExposureCard exposure={exposure()} />);
    expect(texts(r)).not.toContain('Apple Inc AAPL');
    press(r, 'inside QQQ · top 10 of fund');
    expect(texts(r)).toContain('Apple Inc AAPL');
    const t = texts(r);
    expect(t).toContain('8.60%');
    expect(t).toContain('% of the fund itself · as of 2026-09-08 · the 100 on file are 92.4% of the fund');
  });

  test('notes from the server are surfaced, and the footer dates the holdings', () => {
    const t = texts(
      render(
        <ExposureCard
          exposure={exposure({ notes: ["no holdings file — etf-holdings-fetch.sh hasn't run"] })}
        />,
      ),
    );
    expect(t).toContain("no holdings file — etf-holdings-fetch.sh hasn't run");
    expect(t).toContain(
      'issuer holdings as of 2026-09-08 · positions live from spindle · % of paper book',
    );
  });
});

// --- ProposalLedger ---------------------------------------------------------

describe('ProposalLedger', () => {
  const proposals = (over: Partial<TradingProposals> = {}): TradingProposals => ({
    generated_at: null,
    entries_total: 0,
    awaiting: [],
    killed: [],
    resolved: [],
    errors: [],
    ...over,
  });
  const awaiting = {
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
      direction: 'decrease' as const,
      horizon_days: 20,
    },
    confidence: 0.6,
    survived: ['walk-forward', 'costs'],
    decision_id: null,
  };

  test('a ledger that has not been published yet says exactly that', () => {
    expect(texts(render(<ProposalLedger data={null} />))).toEqual([
      "the proposal ledger hasn't been published yet — it appears after the first weekly review",
    ]);
  });

  test('an empty ledger still shows the scorecard stub', () => {
    const t = texts(render(<ProposalLedger data={proposals()} />));
    expect(t).toContain('Nothing is waiting on you — no proposal has survived testing yet.');
    expect(t).toContain('Scorecard — grading begins when proposals resolve');
  });

  test('an awaiting proposal splits its plain name from its description', () => {
    const r = render(<ProposalLedger data={proposals({ awaiting: [awaiting] })} />);
    const t = texts(r);
    expect(t).toContain('Drift band');
    // The PWA wraps this title; clipping it to one line would lose content.
    const title = r.root
      .findAllByType(Text)
      .find((n) => flat(n.props.children) === 'Drift band')!;
    expect(title.props.numberOfLines).toBeUndefined();
    expect(t).toContain('how far a sleeve may wander before it rebalances');
    expect(t).toContain('3 → 4');
    expect(t).toContain('expects turnover to shrink within 20 trading days · confidence 60%');
    expect(t).toContain('survived: walk-forward, costs');
  });

  test('the link says whether a decision card exists yet, and opens the Decisions page', () => {
    const waiting = render(<ProposalLedger data={proposals({ awaiting: [awaiting] })} />);
    expect(texts(waiting)).toContain('its decision card is on its way →');

    const carded = render(
      <ProposalLedger data={proposals({ awaiting: [{ ...awaiting, decision_id: 'd1' }] })} />,
    );
    expect(texts(carded)).toContain('answer it on the Decisions page →');
    press(carded, 'answer it on the Decisions page →');
    expect(router.push).toHaveBeenCalledWith('/decisions');
  });

  test('killed proposals are kept on record, one line each, behind a toggle', () => {
    const r = render(
      <ProposalLedger
        data={proposals({
          killed: [
            {
              id: 'k1',
              ts: null,
              param: 'x',
              param_plain: 'Trade cap — most orders in a day',
              status: 'killed',
              cause: 'failed walk-forward',
            },
          ],
          resolved: [
            { id: 'r1', ts: null, param: 'y', param_plain: 'Y', status: 'resolved', detail: 'ok' },
          ],
        })}
      />,
    );
    expect(texts(r)).toContain("1 proposal didn't make it — kept on record ▾");
    expect(texts(r)).toContain(
      '1 proposal has been answered — they move to the scorecard once graded',
    );
    expect(texts(r).some((s) => s.includes('failed walk-forward'))).toBe(false);

    press(r, "1 proposal didn't make it");
    expect(texts(r)).toContain('Trade cap · failed walk-forward');
  });
});
