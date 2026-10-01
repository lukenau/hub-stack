// VERBATIM COPY of apps/hub/src/lib/decisions.ts (PWA). Do not edit by hand:
// scripts/check-shared-parity.mjs compares this file to the source and
// fails on any difference beyond the two allowed transforms — import
// paths, and `var(--token)` rewritten to the bare token name for
// src/theme's resolveToken(). Change the PWA first, then re-copy.
// --- end copy header; everything below is verbatim ---
import type { TradingDecisionDay } from '../lib/types';

// The decision log is 10 sessions of two strategies, and on almost every one of
// them nothing moves. Rendering all ten at equal weight — which is what the
// card did — buries the single day that changed under forty lines of identical
// percentages. So: state where the strategies stand now, then list only the
// days that moved, and count the rest.

export interface DecisionsView {
  /** Latest session — what each strategy is targeting right now. */
  latest: TradingDecisionDay;
  /** Days a symbol entered or left, newest first. Usually empty. */
  changes: TradingDecisionDay[];
  /** Sessions with no change at all, including the latest if it was quiet. */
  quiet: number;
  /** Sessions in the window. */
  total: number;
}

const moved = (d: TradingDecisionDay) =>
  (d.changed?.added?.length ?? 0) > 0 || (d.changed?.dropped?.length ?? 0) > 0;

export function decisionsView(days: TradingDecisionDay[] | null | undefined): DecisionsView | null {
  if (!days || days.length === 0) return null;
  // The derive emits oldest-first; never mutate the query cache's array.
  const ordered = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const changes = ordered.filter(moved).reverse();
  return {
    latest: ordered[ordered.length - 1],
    changes,
    quiet: ordered.length - changes.length,
    total: ordered.length,
  };
}

export interface TargetChip {
  sym: string;
  pct: number;
}

/** A strategy's targets as chips, biggest first. Weights arrive as fractions. */
export function targetChips(targets: Record<string, number> | null | undefined): TargetChip[] {
  if (!targets) return [];
  return Object.entries(targets)
    .map(([sym, w]) => ({ sym, pct: w * 100 }))
    .sort((a, b) => b.pct - a.pct);
}
