// VERBATIM COPY of apps/hub/src/lib/exposure.ts (PWA). Do not edit by hand:
// scripts/check-shared-parity.mjs compares this file to the source and
// fails on any difference beyond the two allowed transforms — import
// paths, and `var(--token)` rewritten to the bare token name for
// src/theme's resolveToken(). Change the PWA first, then re-copy.
// --- end copy header; everything below is verbatim ---
import type { TradingExposure } from '../lib/types';

// Two facts the ETF look-through card has to state out loud, both of which bit
// on 2026-08-09: the user opened it and saw only QQQ.
//
// 1. The book is one ranked list, not "equity ETFs, then the rest". Printing
//    equity first made a 20%-of-book QQQ sleeve sit above a 25% cash sleeve.
// 2. The ranked single-stock list is capped and concentration-biased. QQQ's
//    largest holding is 8.6% of its fund; IWM's is 0.37% of a small-cap index.
//    Multiplied by position size that is 1.70% vs 0.11% of the book — so a
//    top-20 by book weight is all QQQ *by construction*, covers an eighth of
//    the book, and reads as "you own QQQ" unless the card says otherwise.

export interface BookLine {
  etf: string;
  pct: number;
  equity: boolean;
  describes?: string;
}

/** The whole paper book, equity and not, ranked by size. */
export function bookLines(exposure: TradingExposure): BookLine[] {
  const lines: BookLine[] = Object.entries(exposure.per_etf ?? {}).map(([etf, e]) => ({
    etf,
    pct: e.position_pct_of_book,
    equity: true,
  }));
  for (const n of exposure.non_equity ?? []) {
    if (n.position_pct_of_book == null) continue; // on file but not held
    lines.push({ etf: n.etf, pct: n.position_pct_of_book, equity: false, describes: n.describes });
  }
  return lines.sort((a, b) => b.pct - a.pct);
}

export interface Unrepresented {
  etf: string;
  pct: number;
  maxNamePct: number;
  names: number;
}

/**
 * Held equity ETFs that contribute nothing to the ranked list. Their absence is
 * a fact about concentration, never a failed fetch — so it is reported with the
 * number that explains it, the ETF's largest single name as a share of the book.
 */
export function unrepresented(exposure: TradingExposure): Unrepresented[] {
  return Object.entries(exposure.per_etf ?? {})
    .filter(([, e]) => e.in_top === 0 && e.max_name_pct != null && e.names != null)
    .map(([etf, e]) => ({
      etf,
      pct: e.position_pct_of_book,
      maxNamePct: e.max_name_pct!,
      names: e.names!,
    }))
    .sort((a, b) => b.pct - a.pct);
}
