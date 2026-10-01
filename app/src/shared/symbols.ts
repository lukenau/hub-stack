// VERBATIM COPY of apps/hub/src/lib/symbols.ts (PWA). Do not edit by hand:
// scripts/check-shared-parity.mjs compares this file to the source and
// fails on any difference beyond the two allowed transforms — import
// paths, and `var(--token)` rewritten to the bare token name for
// src/theme's resolveToken(). Change the PWA first, then re-copy.
// --- end copy header; everything below is verbatim ---
// Human names for the spindle strategy universe (the user: "include the ticker
// names"). Shared by TradingCard (Home) and ExposureCard (Money).
export const SYMBOL_NAMES: Record<string, string> = {
  SPY: 'S&P 500',
  QQQ: 'Nasdaq-100',
  IWM: 'Small-Caps',
  EFA: 'Developed Mkts',
  EEM: 'Emerging Mkts',
  TLT: 'Long Treasuries',
  GLD: 'Gold',
  SGOV: 'T-Bills (cash)',
  IEF: '7-10yr Treasuries',
  DBC: 'Commodities',
  UUP: 'Dollar Index',
};

// The strategy book (spindle 0.0.6 runs two at 50/50). Names for the user, plus
// what each strategy's rank score measures — the "what it's watching" blocks
// suffix rows with it so an SMA-trend reading is never labeled momentum.
export const STRATEGY_NAMES: Record<string, string> = {
  trend_rotation: 'Trend rotation',
  multi_asset_trend: 'Diversifier trend',
};

export const stratName = (name: string) => STRATEGY_NAMES[name] ?? name.replace(/_/g, ' ');

export const STRATEGY_SIGNAL: Record<string, string> = {
  trend_rotation: 'momentum',
  multi_asset_trend: 'vs SMA',
};

export const symName = (sym: string | null | undefined) =>
  sym ? (SYMBOL_NAMES[sym] ? `${sym} ${SYMBOL_NAMES[sym]}` : sym) : '';

// Fixed per-asset identity (dataviz rule: hues assigned to entities, never
// cycled). Two color CLASSES, one per strategy (the user: "80 warm 20 cool"):
// trend_rotation assets wear warm tones, diversifier assets cool tones, so
// strategy membership reads at a glance. Values in tokens.css per theme.
export const ETF_SERIES: Record<string, string> = {
  SPY: 'asset-spy',
  QQQ: 'asset-qqq',
  IWM: 'asset-iwm',
  EFA: 'asset-efa',
  EEM: 'asset-eem',
  TLT: 'asset-tlt',
  IEF: 'asset-ief',
  GLD: 'asset-gld',
  DBC: 'asset-dbc',
  UUP: 'asset-uup',
};

export const etfColor = (etf: string) => ETF_SERIES[etf] ?? 'series-other';
