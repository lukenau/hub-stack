// What the paper account holds, as stacked rows (name + dollars + share of the
// account), plus cash on hand; the 50/50 strategy split (each strategy's own
// picks and close-marked return, from /perf attribution); and, when spindle's
// /explain endpoint is up, the picks it is watching grouped per strategy —
// trend_rotation reads as momentum, multi_asset_trend as its SMA trend. While
// /explain is unreachable (expected before the first daily check) the block
// degrades to a one-line "no decision cycle yet today" note; never an error.
//
// Port of apps/hub/src/components/trading/PositionsCard.tsx.
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TradingExplain, TradingPerf } from '../../lib/types';
import { etfColor, stratName, symName } from '../../shared/symbols';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import type { TokenName } from '../../theme/tokens.gen';
import { useTheme } from '../../theme/useTheme';
import { Card } from '../shell';
import {
  positionValueText,
  positionsView,
  rankPrefix,
  rankScoreText,
  signedPct,
  sinceShort,
  targetsLine,
  usd0,
} from './tradingFormat';

export interface PositionsCardProps {
  perf: TradingPerf | null | undefined;
  explain?: TradingExplain | null;
}

export function PositionsCard({ perf, explain }: PositionsCardProps) {
  const { t } = useTheme();
  const [openThesis, setOpenThesis] = useState<string | null>(null);
  if (!perf) return null;

  const v = positionsView(perf, explain);
  if (v.rows.length === 0 && v.cash == null) return null;

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: t('fg-4') }]}>What it holds</Text>

      <View style={styles.rows}>
        {v.rows.map((r) => (
          <View key={r.sym} style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.dot, { backgroundColor: t(etfColor(r.sym) as TokenName) }]} />
              <Text numberOfLines={1} style={[styles.holding, { color: t('fg-1') }]}>
                {symName(r.sym)}
              </Text>
            </View>
            <Text style={[styles.value, { color: t('fg-1') }]}>
              {positionValueText(r)}
              {r.share != null ? (
                <Text style={{ color: t('fg-4') }}> · {Math.round(r.share)}%</Text>
              ) : null}
            </Text>
          </View>
        ))}
        {v.cash != null ? (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.dot, { backgroundColor: t('series-other') }]} />
              <Text style={[styles.cashLabel, { color: t('fg-2') }]}>Cash on hand</Text>
            </View>
            <Text style={[styles.value, { color: t('fg-2') }]}>{usd0(v.cash)}</Text>
          </View>
        ) : null}
      </View>

      {v.rows.length > 0 ? (
        <Text style={[styles.mono10, styles.note, { color: t('fg-4') }]}>
          % = share of the account · what these funds actually own is below
        </Text>
      ) : null}

      {v.strategies.length > 0 ? (
        <View style={[styles.section, { borderTopColor: t('border') }]}>
          <Text style={[styles.eyebrow, styles.sectionHead, { color: t('fg-4') }]}>Strategy split</Text>
          <View style={styles.rows}>
            {v.strategies.map(([name, s]) => (
              <View key={name}>
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Text numberOfLines={1} style={[styles.strategyName, { color: t('fg-1') }]}>
                      {stratName(name)}
                      {/* practice weight is configured, not real — the merge
                          renormalizes over enabled entries, so it holds 0% */}
                      {s.mode !== 'practice' && s.weight != null ? (
                        <Text style={[styles.strategyWeight, { color: t('fg-4') }]}>
                          {' '}
                          · {Math.round(s.weight * 100)}% of the account
                        </Text>
                      ) : null}
                    </Text>
                    {s.mode === 'practice' ? (
                      <Text
                        style={[
                          styles.practicePill,
                          {
                            backgroundColor: t('status-warn-soft'),
                            borderColor: t('status-warn-border'),
                            color: t('status-warn'),
                          },
                        ]}
                      >
                        practice
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.value,
                      { color: s.return_pct >= 0 ? t('status-up') : t('status-down') },
                    ]}
                  >
                    {signedPct(s.return_pct)}
                  </Text>
                </View>
                {s.targets && Object.keys(s.targets).length > 0 ? (
                  <Text style={[styles.targets, { color: t('fg-3') }]}>{targetsLine(s.targets)}</Text>
                ) : null}
              </View>
            ))}
          </View>
          {perf.attribution?.since ? (
            <Text style={[styles.mono10, styles.sinceNote, { color: t('fg-4') }]}>
              each strategy's own picks, marked at close · since {sinceShort(perf.attribution.since)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {v.ranks.length === 0 && v.rows.length > 0 ? (
        <Text style={[styles.mono105, styles.section, { borderTopColor: t('border'), color: t('fg-4') }]}>
          no decision cycle yet today — what it's watching appears after the first one
        </Text>
      ) : null}

      {v.ranks.length > 0 ? (
        <View style={[styles.section, { borderTopColor: t('border') }]}>
          <Text style={[styles.eyebrow, styles.sectionHead, { color: t('fg-4') }]}>
            What it's watching
          </Text>
          <View style={styles.rankRows}>
            {v.rankGroups.map((g) => (
              <Fragment key={g.strategy}>
                {v.rankGroups.length > 1 ? (
                  <Text style={[styles.groupLabel, { color: t('fg-4') }]}>{stratName(g.strategy)}</Text>
                ) : null}
                {g.rows.slice(0, 4).map((r, i) => {
                  const isHeld = v.held.has(r.symbol);
                  const isTargeted = !isHeld && v.targeted.has(r.symbol);
                  const rowKey = `${r.strategy}-${r.symbol}`;
                  const open = openThesis === rowKey;
                  return (
                    <Fragment key={rowKey}>
                      <Pressable
                        onPress={() => setOpenThesis(open ? null : rowKey)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        style={styles.rankRow}
                      >
                        <Text
                          numberOfLines={1}
                          style={[styles.rank, styles.rankName, { color: isHeld ? t('fg-0') : t('fg-3') }]}
                        >
                          {rankPrefix(isHeld, isTargeted, i)} {symName(r.symbol)}
                        </Text>
                        <Text style={[styles.rank, { color: isHeld ? t('fg-1') : t('fg-3') }]}>
                          {rankScoreText(r)}
                        </Text>
                      </Pressable>
                      {open && r.thesis ? (
                        <Text style={[styles.thesis, { color: t('fg-3') }]}>{r.thesis}</Text>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </View>
          <Text style={[styles.mono10, styles.sinceNote, { color: t('fg-4') }]}>
            ● = held now · ◌ = targeted, not yet filled · tap a row for the reasoning
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: fonts.mono(400),
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionHead: { marginBottom: 6 },
  rows: { rowGap: 7 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  holding: { fontFamily: fonts.sans(550), fontSize: 13, flexShrink: 1 },
  cashLabel: { fontFamily: fonts.sans(400), fontSize: 13 },
  value: { fontFamily: fonts.mono(400), fontSize: 12, ...MONO_FEATURES },
  mono10: { fontFamily: fonts.mono(400), fontSize: 10 },
  mono105: { fontFamily: fonts.mono(400), fontSize: 10.5 },
  note: { marginTop: 7 },
  section: { marginTop: 10, paddingTop: 9, borderTopWidth: 1 },
  strategyName: { fontFamily: fonts.sans(550), fontSize: 12.5, flexShrink: 1 },
  strategyWeight: { fontFamily: fonts.mono(550), fontSize: 10.5 },
  // Weight 550 for the same reason as strategyWeight above: in the PWA this
  // pill is a span inside the 550-weight strategy name and inherits it.
  practicePill: {
    marginLeft: 7,
    fontFamily: fonts.mono(550),
    fontSize: 9.5,
    letterSpacing: 0.76,
    textTransform: 'uppercase',
    overflow: 'hidden',
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  targets: { fontFamily: fonts.mono(400), fontSize: 10.5, marginTop: 2, ...MONO_FEATURES },
  sinceNote: { marginTop: 5 },
  rankRows: { rowGap: 4 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 2,
  },
  rank: { fontFamily: fonts.mono(400), fontSize: 11.5, ...MONO_FEATURES },
  rankName: { flexShrink: 1, minWidth: 0 },
  thesis: { fontFamily: fonts.sans(400), fontSize: 11.5, lineHeight: 17.25, marginBottom: 3, paddingLeft: 14 },
  groupLabel: {
    fontFamily: fonts.mono(400),
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
