// TradingCard's derivations (TradingCard.tsx:15-95,118-242,259-291), pure.
//
// The mode badge is load-bearing: dryrun equity is Alpaca PAPER money while
// the real account holds ~$100, so the broker label is bound to the number and
// can never drift from it. Mode stays read-only — the sim→dryrun→live flip is
// a terminal ritual, never a tap.
import type { TradingPerf, TradingStatus } from '../../lib/types';
import type { TokenName } from '../../theme/tokens.gen';
import { relTime } from '../../shared/time';
import { stratName, symName } from '../../shared/symbols';

export interface ModeTone {
  /** Text ink — must clear 4.5:1. */
  color: TokenName;
  /** The 3px left rail: chosen to be SEEN, not read, so it is not the text ink. */
  rail: TokenName;
  soft: TokenName;
  border: TokenName;
}

export const MODE_TONE: Record<string, ModeTone> = {
  sim: { color: 'fg-2', rail: 'ink-faint', soft: 'bg-2', border: 'border-strong' },
  dryrun: { color: 'status-warn', rail: 'status-warn', soft: 'status-warn-soft', border: 'status-warn-border' },
  live: { color: 'status-down', rail: 'status-down', soft: 'status-down-soft', border: 'status-down-border-strong' },
};

export interface Signed {
  text: string;
  positive: boolean;
}

export interface StrategyEntry {
  label: string;
  ret: Signed;
  practice: boolean;
}

export interface FooterPart {
  text: string;
  tone?: TokenName;
}

export interface TradingCardView {
  tone: ModeTone;
  badgeLabel: string;
  brokerLabel: string;
  halted: string | null;
  haltedLine: string;
  equityText: string | null;
  equityLabel: string;
  scaleNote: string | null;
  dayPnl: Signed | null;
  totalPnl: Signed | null;
  /** Shown instead of the headline when there is no equity to report. */
  tradesLine: string | null;
  curve: { date: string; equity: number }[];
  positionsLine: string | null;
  lastOrderLine: string | null;
  strategies: StrategyEntry[];
  /** Fallback when /perf has no journaled day yet. */
  secondStrategyLine: string | null;
  footer: FooterPart[];
}

/** The offline state's whole copy — a bare line, not a card (TradingCard.tsx:34-36). */
export const TRADING_OFFLINE_LINE = 'trading · offline';

/** `null` = render nothing; `'offline'` = the bare offline line. */
export function tradingCardState(
  trading: TradingStatus | null | undefined,
): 'hidden' | 'offline' | 'card' {
  if (!trading) return 'hidden';
  return trading.status === 'offline' ? 'offline' : 'card';
}

function signed(v: number, maxFractionDigits: number, suffix: string): Signed {
  return {
    text: `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })}${suffix}`,
    positive: v >= 0,
  };
}

export function tradingCardView(
  trading: TradingStatus,
  perf: TradingPerf | null | undefined,
  now = Date.now(),
): TradingCardView {
  // Spindle self-reports mode:"live" while trading Alpaca paper money and
  // sends no broker field — a red LIVE badge on paper equity misleads, so
  // "live" without a broker is forced to the PAPER treatment.
  const paperForced = trading.mode === 'live' && !trading.broker;
  const tone = paperForced ? MODE_TONE.dryrun : (MODE_TONE[trading.mode] ?? MODE_TONE.sim);
  const brokerLabel =
    paperForced || trading.broker?.includes('paper') || trading.mode === 'dryrun'
      ? 'PAPER'
      : trading.mode === 'live'
        ? 'LIVE'
        : trading.mode.toUpperCase();
  const badgeLabel = paperForced ? 'PAPER' : `${trading.mode}${trading.broker ? ` · ${brokerLabel}` : ''}`;

  const equity = perf?.equity ?? trading.equity;
  const divisor = perf?.display_divisor ?? trading.display_divisor ?? null;
  const scaled = divisor != null && divisor > 1;
  const scale = (v: number | null | undefined): number | null =>
    scaled && v != null && divisor != null ? v / divisor : (v ?? null);
  const equityShown = scaled ? (perf?.equity_display ?? scale(equity)) : (equity ?? null);
  const dayPnl = scaled ? (perf?.day_pnl_display ?? scale(perf?.day_pnl)) : (perf?.day_pnl ?? null);
  const totalPnl = scaled ? (perf?.total_pnl_display ?? scale(perf?.total_pnl)) : (perf?.total_pnl ?? null);
  const curve = (scaled ? perf?.curve_display : null) ?? perf?.curve ?? [];
  const cashRaw = perf?.cash ?? trading.cash;
  const cash = scaled ? (perf?.cash_display ?? scale(cashRaw)) : (cashRaw ?? null);
  const spentToday = scaled
    ? (trading.spent_today_display ?? scale(trading.spent_today))
    : (trading.spent_today ?? null);

  const positions = trading.positions ?? [];
  const perfPositions = Object.entries(perf?.positions ?? {});
  const positionsLine =
    perfPositions.length > 0
      ? perfPositions
          .map(([sym, qty]) => {
            const px = perf?.prices?.[sym];
            const raw = px != null ? qty * px : null;
            const val = scaled ? (perf?.position_values_display?.[sym] ?? scale(raw)) : raw;
            return `${symName(sym)} ${qty.toFixed(1)}${val != null ? ` ($${Math.round(val).toLocaleString()})` : ''}`;
          })
          .join(' · ')
      : positions.length > 0
        ? positions.map((p) => `${symName(p.symbol)} ${p.qty}`).join(' · ')
        : null;

  const lastOrder = trading.last_order;
  // `?? ''` where the PWA leans on JSX rendering null as nothing: a template
  // string would print the word "null" into the sentence.
  const lastOrderQty =
    lastOrder?.qty != null && !Number.isNaN(Number(lastOrder.qty))
      ? Number(lastOrder.qty).toFixed(2)
      : (lastOrder?.qty ?? '');
  const lastOrderVal = scaled ? lastOrder?.value_display : lastOrder?.value;
  const orderVerb =
    lastOrder?.side === 'sell' ? 'sold' : lastOrder?.side === 'buy' ? 'bought' : (lastOrder?.side ?? '');
  const lastOrderLine = lastOrder
    ? `last order ${orderVerb} ${lastOrderQty} ${symName(lastOrder.symbol)}` +
      `${lastOrderVal != null ? ` (~$${Math.round(lastOrderVal).toLocaleString()})` : ''} · ${relTime(lastOrder.ts, now)}`
    : null;

  const strategies: StrategyEntry[] = Object.entries(perf?.attribution?.strategies ?? {}).map(([name, s]) => ({
    // A practice strategy's configured weight is not a real share — the merge
    // renormalizes over enabled entries, so it holds 0%.
    label: `${stratName(name)}${s.mode !== 'practice' && s.weight != null ? ` ${Math.round(s.weight * 100)}%` : ''}`,
    ret: {
      text: `${s.return_pct >= 0 ? '+' : '−'}${Math.abs(s.return_pct).toFixed(1)}%`,
      positive: s.return_pct >= 0,
    },
    practice: s.mode === 'practice',
  }));

  const ss = trading.second_strategy;
  // {"mode":"off"} arrives with no name/weight (loop not running, or a
  // single-strategy book) — that shape renders nothing.
  const secondStrategyLine =
    strategies.length === 0 && ss && ss.mode !== 'off' && ss.name
      ? `2 strategies · ${stratName(ss.name)}` +
        `${ss.mode !== 'practice' && ss.weight != null ? ` ${Math.round(ss.weight * 100)}%` : ''}` +
        `${ss.mode === 'practice' ? ' · practice' : ''}`
      : null;

  const footer: FooterPart[] = [];
  if (cash != null) footer.push({ text: `cash $${Math.round(cash).toLocaleString()}` });
  if (spentToday != null) footer.push({ text: `spent today $${Math.round(spentToday).toLocaleString()}` });
  if (trading.gated_streak != null && trading.gated_streak > 0) {
    footer.push({
      text: `risk rules have blocked the last ${trading.gated_streak} trade idea${trading.gated_streak === 1 ? '' : 's'} — investigate`,
      tone: 'status-warn',
    });
  }
  if (trading.last_iteration) {
    footer.push({ text: `last check ${relTime(trading.last_iteration, now)}` });
  } else if (trading.last_tick_age_s != null) {
    footer.push({
      text: `last check ${trading.last_tick_age_s < 90 ? 'just now' : `${Math.floor(trading.last_tick_age_s / 60)}m ago`}`,
    });
  }
  if (trading.status === 'stale') footer.push({ text: 'check is overdue', tone: 'status-warn' });

  return {
    tone,
    badgeLabel,
    brokerLabel,
    halted: trading.halted,
    haltedLine:
      (trading.halted_since ? `paused since ${relTime(trading.halted_since, now)} · ` : '') +
      "it won't trade again until manually resumed",
    equityText:
      equityShown != null
        ? `$${equityShown.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null,
    equityLabel: brokerLabel === 'PAPER' ? 'paper equity' : 'equity',
    scaleNote:
      scaled && equity != null
        ? `(×${divisor} account scale: $${Math.round(equity).toLocaleString()})`
        : null,
    dayPnl: dayPnl != null ? signed(dayPnl, scaled ? 2 : 0, ' today') : null,
    totalPnl: totalPnl != null ? signed(totalPnl, scaled ? 2 : 0, ' total') : null,
    tradesLine:
      equityShown != null
        ? null
        : trading.trades_today != null && trading.trades_today > 0
          ? `${trading.trades_today} trade${trading.trades_today === 1 ? '' : 's'} today`
          : 'no trades yet today',
    curve,
    positionsLine,
    lastOrderLine,
    strategies,
    secondStrategyLine,
    footer,
  };
}

// --- sparkline (TradingCard.tsx:259-291) -----------------------------------

/** The PWA's `viewBox="0 0 280 36"`; `preserveAspectRatio` leaves it 280 wide. */
export const SPARK_W = 280;
export const SPARK_H = 36;

export interface Sparkline {
  /** SVG path string — Skia's `Path` parses the same grammar as `<polyline>`. */
  path: string;
  end: { x: number; y: number };
}

export function sparkline(
  curve: { date: string; equity: number }[],
  w = SPARK_W,
  h = SPARK_H,
): Sparkline | null {
  if (curve.length < 2) return null;
  const values = curve.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: Number(((i / (values.length - 1)) * w).toFixed(1)),
    y: Number((h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)),
  }));
  return {
    path: pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' '),
    end: pts[pts.length - 1],
  };
}

/** Always says "Paper" — the PWA's own wording (inventory OQ-10). */
export function sparklineLabel(curve: { date: string; equity: number }[]): string {
  return `Paper equity, ${curve[0].date} to ${curve[curve.length - 1].date}`;
}
