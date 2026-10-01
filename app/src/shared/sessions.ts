// VERBATIM COPY of apps/hub/src/lib/sessions.ts (PWA). Do not edit by hand:
// scripts/check-shared-parity.mjs compares this file to the source and
// fails on any difference beyond the two allowed transforms — import
// paths, and `var(--token)` rewritten to the bare token name for
// src/theme's resolveToken(). Change the PWA first, then re-copy.
// --- end copy header; everything below is verbatim ---
import type { TradingSession } from '../lib/types';

// The money figure on a session row. Three separate things were wrong with it,
// all reported by the user on 2026-08-09 ("are the amounts correct? it feels off").
//
// 1. SCALE. The book trades at full size and the whole Trading tab divides by
//    perf.display_divisor for display — the equity card read $5,227.55 while
//    this log printed day moves of +$1,368 beside it, 20x too large.
//
// 2. DEFINITION. equity_open is the first mark of the session, so close-minus-
//    open is an INTRADAY move and every overnight gap fell in the cracks. Over
//    ten live sessions the rows summed to +$1,475 against an actual +$4,084,
//    and two of them carried the wrong sign: 2026-07-31 read -$899 on a day the
//    account gained $156, 2026-08-06 read +$99 on a day it lost $189. The day
//    change is close-to-close, which also makes the column reconcile with the
//    equity curve exactly, since each session's close IS that curve's point.
//
// 3. ATTRIBUTION. Green and red claim the move is the agent's doing, so only a
//    session that did what it intended earns them — see traded, below.

export interface SessionMove {
  amount: number;
  /** True only when the session traded cleanly: no halt, no refusals, orders placed. */
  traded: boolean;
}

/**
 * Day moves keyed by session day, at display scale. The first session has no
 * prior close to measure from and maps to null — an honest gap, never a zero.
 */
export function sessionMoves(
  sessions: TradingSession[] | null | undefined,
  divisor?: number | null,
): Map<string, SessionMove | null> {
  const out = new Map<string, SessionMove | null>();
  if (!sessions) return out;
  const scale = divisor != null && divisor > 1 ? divisor : 1;
  const ordered = [...sessions].sort((a, b) => a.day.localeCompare(b.day));
  let prevClose: number | null = null;
  for (const s of ordered) {
    const move =
      prevClose != null && s.equity_close != null
        ? // 'traded' is the derive's verb for a clean session — not halted, none
          // refused, orders placed. The counts alone cannot carry the halt:
          // 2026-07-29 placed 8 orders while frozen.
          { amount: (s.equity_close - prevClose) / scale, traded: s.verb === 'traded' }
        : null;
    out.set(s.day, move);
    if (s.equity_close != null) prevClose = s.equity_close;
  }
  return out;
}
