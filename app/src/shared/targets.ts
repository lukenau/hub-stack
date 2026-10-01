// VERBATIM COPY of apps/hub/src/lib/targets.ts (PWA). Do not edit by hand:
// scripts/check-shared-parity.mjs compares this file to the source and
// fails on any difference beyond the two allowed transforms — import
// paths, and `var(--token)` rewritten to the bare token name for
// src/theme's resolveToken(). Change the PWA first, then re-copy.
// --- end copy header; everything below is verbatim ---
// Wants-vs-holds arithmetic for the Trading tab, kept pure so it can be
// exercised against live payloads by scripts/check-targets.mjs.
//
// `wants` comes from /explain targets — the MERGED book vector (each strategy's
// target x its weight, netted), never a per-strategy number. It is snapshotted
// before the post-resume half-size factor is applied, so callers pass halfSize
// to keep the comparison honest on a cool-down day.
//
// A leg we hold but cannot price reads as unknown, never as zero: claiming
// "not filled" for a position that exists would be exactly the kind of
// confident-and-wrong the tab exists to prevent.
export interface TargetRow {
  symbol: string;
  wants: number; // percent of the account, 0-100
  holds: number | null; // percent of the account; null = held but unpriceable
  gap: number | null; // holds - wants, in percentage points; null when unknown
  unfilled: boolean; // wanted, and not held at all
  drifted: boolean; // held and priced, but materially off target
}

const DRIFT_PCT = 3;

export function targetRows(
  targets: { symbol: string; weight: number }[] | undefined,
  positions: Record<string, number> | undefined,
  prices: Record<string, number> | undefined,
  equity: number | null | undefined,
  halfSize = false,
): TargetRow[] {
  // Absent targets and empty targets are NOT the same thing, and conflating
  // them is a false-alarm generator: /explain 503s until the first completed
  // iteration, so after any restart outside market hours we know the holdings
  // but not the intent. Comparing against a phantom all-zero target would paint
  // every held leg red "off target". No target vector => nothing to compare.
  // An explicitly empty vector still compares — it means "wants nothing".
  if (targets == null) return [];

  const want = new Map<string, number>();
  for (const t of targets ?? []) {
    want.set(t.symbol, t.weight * 100 * (halfSize ? 0.5 : 1));
  }

  const held = new Map<string, number>(); // symbol -> qty, whether priceable or not
  for (const [sym, qty] of Object.entries(positions ?? {})) {
    if (qty !== 0) held.set(sym, qty);
  }

  const rows: TargetRow[] = [...new Set([...want.keys(), ...held.keys()])].map((symbol) => {
    const wants = want.get(symbol) ?? 0;
    const qty = held.get(symbol);
    const px = prices?.[symbol];

    let holds: number | null;
    if (qty == null) holds = 0; // genuinely not held
    else if (px != null && equity && equity > 0) holds = (qty * px) / equity * 100;
    else holds = null; // held, but we cannot value it

    const gap = holds == null ? null : holds - wants;
    const unfilled = wants > 0 && qty == null;
    const drifted = gap != null && !unfilled && Math.abs(gap) >= DRIFT_PCT;
    return { symbol, wants, holds, gap, unfilled, drifted };
  });

  rows.sort((a, b) => b.wants - a.wants || (b.holds ?? 0) - (a.holds ?? 0));
  return rows;
}
