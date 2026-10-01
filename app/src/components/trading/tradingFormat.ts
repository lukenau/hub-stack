// Every string and number the Trading surface computes, kept out of the
// components so the copy can be asserted without a renderer. Ports the inline
// derivations of apps/hub/src/components/trading/{TradingStatusStrip,
// GuardrailsStrip,BlockedCard,PositionsCard,SessionLog,DecisionsCard,
// TradingActivity,ExposureCard,ProposalLedger}.tsx (docs/inventory/trading.md
// §4.1-4.12). Colours are TOKEN NAMES — resolve with useTheme's `t()`.
//
// JSX collapses a newline plus indentation into one space, so a sentence the
// PWA wraps across two source lines is one space-joined string here.
import type {
  BlockedOrder,
  BlockedSymbol,
  ProposalAwaiting,
  TradingAdvisoryNote,
  TradingBudget,
  TradingEvent,
  TradingExplain,
  TradingPerf,
  TradingSession,
  TradingSessionTrade,
  TradingStatus,
} from '../../lib/types';
import { STRATEGY_SIGNAL, stratName, symName } from '../../shared/symbols';
import { relTime } from '../../shared/time';
import type { TokenName } from '../../theme/tokens.gen';

// --- money / date -----------------------------------------------------------

/** `$${Math.round(v).toLocaleString()}` — the app's whole-dollar money string. */
export const usd0 = (v: number) => `$${Math.round(v).toLocaleString()}`;

/** Two-decimal money, used for session moves. */
export const usd2 = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Weekday only, UTC (BlockedCard.tsx:16-20). */
export function dayLabelLong(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString([], { weekday: 'long', timeZone: 'UTC' });
}

/** "Aug 5", UTC (BlockedCard.tsx:24-28). */
export function dateLabelShort(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Wed, Aug 5", UTC (SessionLog.tsx:30-34, DecisionsCard.tsx:17-21). */
export function dateLabelWeekday(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Aug 5" from a bare `YYYY-MM-DD`, UTC (PositionsCard.tsx:13-17). */
export function sinceShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// --- status strip (TradingStatusStrip.tsx) ----------------------------------

export interface ModeTone {
  color: TokenName;
  soft: TokenName;
  border: TokenName;
}

export const MODE_TONE: Record<string, ModeTone> = {
  sim: { color: 'fg-2', soft: 'bg-2', border: 'border-strong' },
  dryrun: { color: 'status-warn', soft: 'status-warn-soft', border: 'status-warn-border' },
  live: { color: 'status-down', soft: 'status-down-soft', border: 'status-down-border-strong' },
};

export interface StatusStripView {
  tone: ModeTone;
  badge: string;
  /** Health dot: red halted, amber stale, green otherwise. */
  dot: TokenName;
  statusColor: TokenName;
  statusText: string;
  tradesLabel: string | null;
  secondStrategy: string | null;
  gated: number;
}

export function statusStripView(
  trading: TradingStatus,
  budget?: TradingBudget | null,
  now = Date.now(),
): StatusStripView {
  // Spindle self-reports mode:"live" while trading Alpaca paper money and sends
  // no broker field — "live" without a broker is forced to the PAPER treatment.
  const paperForced = trading.mode === 'live' && !trading.broker;
  const tone = paperForced ? MODE_TONE.dryrun : (MODE_TONE[trading.mode] ?? MODE_TONE.sim);
  const badge =
    paperForced || trading.broker?.includes('paper') || trading.mode === 'dryrun'
      ? 'PAPER'
      : trading.mode === 'live'
        ? 'LIVE'
        : 'PRACTICE';

  const stale = trading.status === 'stale';
  const lastCheck = trading.last_iteration
    ? relTime(trading.last_iteration, now)
    : trading.last_tick_age_s != null
      ? trading.last_tick_age_s < 90
        ? 'just now'
        : `${Math.floor(trading.last_tick_age_s / 60)}m ago`
      : null;

  const divisor = trading.display_divisor ?? null;
  const spentRaw = budget?.spent_today ?? trading.spent_today ?? null;
  const spent =
    divisor != null && divisor > 1
      ? spentRaw != null
        ? spentRaw / divisor
        : (trading.spent_today_display ?? null)
      : spentRaw;
  const tradesToday = budget?.trades_today ?? trading.trades_today ?? null;
  const tradesLabel =
    budget?.market_day === false
      ? 'market closed'
      : tradesToday != null && tradesToday > 0
        ? `${tradesToday} trade${tradesToday === 1 ? '' : 's'} today${
            spent != null && spent > 0 ? ` · spent $${Math.round(spent).toLocaleString()}` : ''
          }`
        : tradesToday === 0
          ? 'no trades yet today'
          : null;

  const second = trading.second_strategy;
  const secondStrategy =
    second && second.mode !== 'off' && second.name
      ? second.mode === 'practice'
        ? `${stratName(second.name)} in practice`
        : '2 strategies'
      : null;

  return {
    tone,
    badge,
    dot: trading.halted ? 'status-down' : stale ? 'status-warn' : 'status-up',
    statusColor: stale ? 'status-warn' : 'fg-3',
    statusText: `${trading.halted ? 'paused' : stale ? 'check is overdue' : 'running'}${
      lastCheck ? ` · last check ${lastCheck}` : ''
    }${trading.next_tick ? ` · next check ${relTime(trading.next_tick, now)}` : ''}`,
    tradesLabel,
    secondStrategy,
    gated: trading.gated_streak ?? 0,
  };
}

/** Risk-rule banner (TradingStatusStrip.tsx:181-183). */
export const gatedStreakLine = (gated: number) =>
  `Risk rules have blocked the last ${gated} trade idea${gated === 1 ? '' : 's'} — investigate.`;

// --- guardrails strip (GuardrailsStrip.tsx) ---------------------------------

export function guardrailsLine(budget: TradingBudget): string {
  const used = budget.trades_today;
  const max = budget.max_trades_per_day;
  if (budget.market_day === false) return 'market closed — no trading today';
  if (max != null) {
    return used > 0
      ? `${used} of ${max} trades used today`
      : `no trades yet today · it will make at most ${max}`;
  }
  return used > 0 ? `${used} trades today` : 'no trades yet today';
}

/**
 * Silent until the breaker is one day away, and always from the RECOMPUTED
 * streak — `consecutive_losing_days_stored` lags a session and alarmed all
 * night over a streak that had already broken (GuardrailsStrip.tsx:8-12,25).
 */
export function losingDaysWarning(budget: TradingBudget): string | null {
  const streak = budget.consecutive_losing_days;
  const haltAt = budget.halt_at_losing_days;
  if (!(haltAt != null && streak > 0 && streak >= haltAt - 1 && !budget.halted)) return null;
  return `${streak} material losing ${streak === 1 ? 'day' : 'days'} in a row — one more and it pauses itself until you resume it.`;
}

// --- blocked card (BlockedCard.tsx) -----------------------------------------

export interface BlockedView {
  blocked: BlockedOrder[];
  /** count >= 2 and still unresolved — the point of the card. */
  tripwires: [string, BlockedSymbol][];
  settled: [string, BlockedSymbol][];
  halted: boolean;
  /** "Aug 5" or "Aug 4–Aug 5" (en dash) over the distinct blocked days. */
  blockedRange: string | null;
}

export function blockedView(log: {
  blocked?: BlockedOrder[] | null;
  blocked_days?: Record<string, BlockedSymbol> | null;
  budget?: TradingBudget | null;
}): BlockedView {
  const blocked = log.blocked ?? [];
  const entries = Object.entries(log.blocked_days ?? {});
  const days = [...new Set(blocked.map((b) => b.day))].sort();
  return {
    blocked,
    tripwires: entries.filter(([, v]) => v.count >= 2 && !v.resolved_on),
    settled: entries.filter(([, v]) => v.count >= 2 && v.resolved_on),
    halted: Boolean(log.budget?.halted),
    blockedRange:
      days.length === 0
        ? null
        : days.length === 1
          ? dateLabelShort(days[0])
          : `${dateLabelShort(days[0])}–${dateLabelShort(days[days.length - 1])}`,
  };
}

/** "3 orders were blocked on Aug 4–Aug 5, and every one went in on Aug 6." */
export function blockedSummary(view: BlockedView): string {
  const n = view.blocked.length;
  const range = view.blockedRange ? ` on ${view.blockedRange}` : '';
  const settled =
    view.settled.length > 0
      ? `, and every one went in on ${dateLabelShort(view.settled[0][1].resolved_on!)}`
      : '';
  return `${n} order${n === 1 ? ' was' : 's were'} blocked${range}${settled}.`;
}

/** One collapsed row: "SPY S&P 500 ~$1,200 · the price quote was too old to trust · Aug 5". */
export function blockedRowLine(b: BlockedOrder): string {
  const value = b.value_display != null ? ` ~${usd0(b.value_display)}` : '';
  return `${symName(b.symbol ?? '')}${value} · ${b.reason_plain} · ${dateLabelShort(b.day)}`;
}

/** The tripwire alert — each day names its OWN reason (BlockedCard.tsx:11-14). */
export function tripwireLine(symbol: string, v: BlockedSymbol): string {
  const reasons = v.days.map((d) => `${d.reason_plain} on ${dayLabelLong(d.day)}`).join(', then ');
  return `${symName(symbol)} was blocked ${v.count} days running — ${reasons}. No order for it has gone in since.`;
}

/** "an order went in", never "filled" — no fill is ever journaled. */
export const settledLine = (settled: [string, BlockedSymbol][]) =>
  `since then an order went in for ${settled
    .map(([s, v]) => `${symName(s)} on ${dateLabelShort(v.resolved_on!)}`)
    .join(' · ')}`;

// --- positions card (PositionsCard.tsx) -------------------------------------

export interface PositionRow {
  sym: string;
  qty: number;
  val: number | null;
  share: number | null;
}

export interface RankGroup {
  strategy: string;
  rows: TradingExplain['ranks'];
}

export interface PositionsView {
  rows: PositionRow[];
  cash: number | null;
  held: Set<string>;
  targeted: Set<string>;
  ranks: TradingExplain['ranks'];
  rankGroups: RankGroup[];
  strategies: [string, NonNullable<TradingPerf['attribution']>['strategies'][string]][];
}

export function positionsView(perf: TradingPerf, explain?: TradingExplain | null): PositionsView {
  const divisor = perf.display_divisor ?? null;
  const scaled = divisor != null && divisor > 1;
  const scale = (v: number | null | undefined): number | null =>
    v == null ? null : scaled ? v / divisor! : v;
  const equity = scaled ? (perf.equity_display ?? scale(perf.equity)) : (perf.equity ?? null);
  const cash = scaled ? (perf.cash_display ?? scale(perf.cash)) : (perf.cash ?? null);

  const rows = Object.entries(perf.positions ?? {}).map(([sym, qty]) => {
    const px = perf.prices?.[sym];
    const raw = px != null ? qty * px : null;
    const val = scaled ? (perf.position_values_display?.[sym] ?? scale(raw)) : raw;
    const share = val != null && equity != null && equity > 0 ? (val / equity) * 100 : null;
    return { sym, qty, val, share };
  });
  rows.sort((a, b) => (b.val ?? 0) - (a.val ?? 0));

  const ranks = explain?.ranks ?? [];
  // Group in arrival order (spindle emits each strategy's ranks contiguously,
  // best first) — GLD lives in both universes, so rows key on strategy+symbol.
  const rankGroups = ranks.reduce<RankGroup[]>((acc, r) => {
    const g = acc.find((x) => x.strategy === r.strategy);
    if (g) g.rows.push(r);
    else acc.push({ strategy: r.strategy, rows: [r] });
    return acc;
  }, []);

  return {
    rows,
    cash,
    held: new Set(rows.map((r) => r.sym)),
    // explain.targets is the MERGED book vector — here it only marks symbols
    // the book targets but hasn't filled yet.
    targeted: new Set((explain?.targets ?? []).map((t) => t.symbol)),
    ranks,
    rankGroups,
    strategies: Object.entries(perf.attribution?.strategies ?? {}),
  };
}

/** A position's right-hand column: dollars when priced, share count when not. */
export const positionValueText = (r: PositionRow) =>
  r.val != null ? usd0(r.val) : `${r.qty.toFixed(1)} shares`;

/** Signed percent with a U+2212 minus, as every PnL/return/score string uses. */
export const signedPct = (v: number, digits = 1) =>
  `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}%`;

/** A strategy's own target vector: "SPY S&P 500 50% · GLD Gold 50%". */
export const targetsLine = (targets: Record<string, number>) =>
  Object.entries(targets)
    .map(([sym, w]) => `${symName(sym)} ${Math.round(w * 100)}%`)
    .join(' · ');

/** "+12.4% momentum" — the score plus what that strategy's score measures. */
export const rankScoreText = (r: { strategy: string; score: number }) =>
  `${signedPct(r.score * 100)} ${STRATEGY_SIGNAL[r.strategy] ?? ''}`;

export const rankPrefix = (isHeld: boolean, isTargeted: boolean, index: number) =>
  isHeld ? '●' : isTargeted ? '◌' : `${index + 1}.`;

// --- session log (SessionLog.tsx) -------------------------------------------

export const VERB_TONE: Record<string, TokenName> = {
  frozen: 'status-down',
  blocked: 'status-warn',
  traded: 'fg-0',
  held: 'fg-3',
  quiet: 'fg-4',
};

export const VERB_GLOSS: Record<string, string> = {
  frozen: 'paused — it kept wanting to act and couldn’t',
  blocked: 'wanted to trade and was refused',
  traded: 'placed orders',
  held: 'nothing to change',
  quiet: 'no decision ran',
};

/** "2 orders · 1 refused", falling back to the verb's gloss. */
export function sessionDetail(s: TradingSession): string {
  const detail = [
    s.placed > 0 ? `${s.placed} order${s.placed === 1 ? '' : 's'}` : null,
    s.refused > 0 ? `${s.refused} refused` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return detail || VERB_GLOSS[s.verb] || '';
}

/** "3:58 PM ET · sell 5.76 EEM @ $42.10 · $249 · pending_new". */
export function tradeLine(t: TradingSessionTrade): string {
  const qty = t.qty != null ? t.qty.toFixed(2).replace(/\.00$/, '') : '?';
  const time = new Date(t.ts).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  const px = t.price != null ? ` @ $${t.price.toFixed(2)}` : '';
  const val = t.value_display ?? t.value;
  const money = val != null ? ` · ${usd0(val)}` : '';
  const status = t.status && t.status !== 'filled' ? ` · ${t.status}` : '';
  return `${time} ET · ${t.side} ${qty} ${t.symbol}${px}${money}${status}`;
}

/** Close-to-close move, signed with a U+2212 minus and always two decimals. */
export const moveText = (amount: number) => `${amount >= 0 ? '+' : '−'}${usd2(Math.abs(amount))}`;

// --- daily decisions (DecisionsCard.tsx) ------------------------------------

export const changesHeader = (total: number) =>
  `Changes · last ${total} ${total === 1 ? 'session' : 'sessions'}`;

export const noChangesLine = (quiet: number) =>
  `nothing entered or left the book — ${quiet} ${quiet === 1 ? 'session' : 'sessions'} unchanged`;

export const quietTailLine = (quiet: number) =>
  `the other ${quiet} ${quiet === 1 ? 'session' : 'sessions'} held steady`;

// --- trading activity (TradingActivity.tsx) ---------------------------------

const ORDER_RE = /^(Bought|Sold)\s+([\d.]+)\s+([A-Z]+)$/;

/** Advisory notes are keyed by the UTC day of the event (TradingActivity.tsx:16-18). */
export const advisoryDay = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

export interface ActivityRow {
  key: string;
  ts: number;
  /** Parsed order sentence, or the raw event title when it isn't one. */
  title: string;
  /** "(~$1,234)" at today's marked price, or null when unpriceable. */
  value: string | null;
  filling: boolean;
  advisory: TradingAdvisoryNote | null;
}

/** Newest first, advisory/skipped receipts dropped (TradingActivity.tsx:36-37). */
export function activityRows(
  events: TradingEvent[],
  perf?: TradingPerf | null,
  advisory?: Record<string, TradingAdvisoryNote> | null,
): ActivityRow[] {
  const divisor = perf?.display_divisor ?? null;
  const scaled = divisor != null && divisor > 1;
  return [...events]
    .reverse()
    .filter((e) => e.status !== 'skipped')
    .map((e) => {
      const m = ORDER_RE.exec(e.title);
      const px = m ? perf?.prices?.[m[3]] : null;
      const rawVal = m && px != null ? Number(m[2]) * px : null;
      const val = rawVal != null ? (scaled ? rawVal / divisor! : rawVal) : null;
      const isAdvisory = /^Advisory/i.test(e.title);
      return {
        key: `${e.ts}-${e.title}`,
        ts: e.ts,
        title: m ? `${m[1]} ${Number(m[2]).toFixed(2)} ${symName(m[3])}` : e.title,
        value: val != null ? `(~${usd0(val)})` : null,
        filling: e.status === 'pending_new',
        advisory: (isAdvisory ? advisory?.[advisoryDay(e.ts)] : undefined) ?? null,
      };
    });
}

export const ACTIVITY_PREVIEW = 5;

export const showMoreLabel = (total: number, showAll: boolean) =>
  showAll ? 'show fewer ▴' : `show ${total - ACTIVITY_PREVIEW} more ▾`;

export interface AdvisoryLines {
  head: string;
  rationale: string | null;
  wouldApply: string | null;
  meta: string;
}

export function advisoryLines(note: TradingAdvisoryNote): AdvisoryLines {
  const head = [
    note.action ?? note.status ?? '',
    note.confidence != null ? ` · confidence ${Math.round(note.confidence * 100)}%` : '',
    note.status && note.action && note.status !== 'applied' ? ` · ${note.status} — not applied` : '',
  ].join('');
  return {
    head,
    rationale: note.rationale ? `“${note.rationale}”` : null,
    wouldApply:
      note.would_apply && note.would_apply.length > 0
        ? `would have set: ${note.would_apply
            .map((t) => `${symName(t.symbol)} ${Math.round(t.weight * 100)}%`)
            .join(' · ')}`
        : null,
    meta: [note.model, note.reason].filter(Boolean).join(' · '),
  };
}

// --- exposure card (ExposureCard.tsx) ---------------------------------------

/** Two decimals below 10%, one above — ExposureCard.tsx:21. */
export const fmtPct = (v: number) => `${v >= 10 ? v.toFixed(1) : v.toFixed(2)}%`;

/** Issuer names arrive ALLCAPS; short all-cap words (SK, AT, 3I) stay as-is. */
export function titleCase(s: string | null): string {
  if (!s) return '';
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

export const viaLine = (v: { etf: string; weight_pct?: number | null; contrib_pct: number }) =>
  `via ${v.etf}${v.weight_pct != null ? ` · ${fmtPct(v.weight_pct)} of fund` : ''} → ${fmtPct(
    v.contrib_pct,
  )} of book`;

export const etfFooter = (e: { as_of: string | null; names?: number; fund_pct?: number }) =>
  `% of the fund itself · as of ${e.as_of ?? '—'}${
    e.names != null && e.fund_pct != null
      ? ` · the ${e.names} on file are ${fmtPct(e.fund_pct)} of the fund`
      : ''
  }`;

// --- proposal ledger (ProposalLedger.tsx) -----------------------------------

/** `param_plain` is "short name — description"; the card splits on the em dash. */
export const proposalTitle = (paramPlain: string) => paramPlain.split('—')[0].trim();

export const proposalSubtitle = (paramPlain: string) =>
  paramPlain.includes('—') ? paramPlain.split('—').slice(1).join('—').trim() : null;

export function expectationLine(p: ProposalAwaiting): string {
  const pct = p.confidence == null ? null : `${Math.round(p.confidence * 100)}%`;
  return `expects ${p.expectation.metric_plain} to ${
    p.expectation.direction === 'decrease' ? 'shrink' : 'grow'
  }${
    p.expectation.horizon_days != null ? ` within ${p.expectation.horizon_days} trading days` : ''
  }${pct != null ? ` · confidence ${pct}` : ''}`;
}

export const killedHeader = (count: number, showKilled: boolean) =>
  `${count === 1 ? '1 proposal' : `${count} proposals`} didn't make it — kept on record ${
    showKilled ? '▴' : '▾'
  }`;

export const resolvedLine = (count: number) =>
  `${
    count === 1 ? '1 proposal has' : `${count} proposals have`
  } been answered — they move to the scorecard once graded`;
