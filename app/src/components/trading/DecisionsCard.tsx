// What each strategy chose, and what changed. The two strategies are journaled
// separately, so these are their OWN target vectors — unlike /explain targets,
// which are the merged book and must never be shown per strategy.
//
// Almost every session reads "no change", which is the point: this book is meant
// to sit still. Printing ten identical days at equal weight (which is what this
// card used to do) hides the one day that moved, so the layout is inverted —
// where the strategies stand now, then only the days something entered or left.
//
// Port of apps/hub/src/components/trading/DecisionsCard.tsx.
import { StyleSheet, Text, View } from 'react-native';
import type { TradingDecisionDay } from '../../lib/types';
import { decisionsView, targetChips } from '../../shared/decisions';
import { etfColor, stratName, symName } from '../../shared/symbols';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import type { TokenName } from '../../theme/tokens.gen';
import { useTheme } from '../../theme/useTheme';
import { Card } from '../shell';
import { changesHeader, dateLabelWeekday, noChangesLine, quietTailLine } from './tradingFormat';

function Chips({ targets }: { targets: Record<string, number> | null }) {
  const { t } = useTheme();
  const chips = targetChips(targets);
  if (chips.length === 0) {
    return <Text style={[styles.cashLine, { color: t('fg-3') }]}>nothing — sitting in cash</Text>;
  }
  return (
    <View style={styles.chips}>
      {chips.map((c) => (
        <View key={c.sym} style={styles.chip}>
          <View style={[styles.chipDot, { backgroundColor: t(etfColor(c.sym) as TokenName) }]} />
          <Text style={[styles.chipName, { color: t('fg-2') }]}>{symName(c.sym)}</Text>
          <Text style={[styles.chipPct, { color: t('fg-1') }]}>{Math.round(c.pct)}%</Text>
        </View>
      ))}
    </View>
  );
}

export function DecisionsCard({ decisions }: { decisions: TradingDecisionDay[] | null | undefined }) {
  const { t } = useTheme();
  const view = decisionsView(decisions);
  if (!view) return null;
  const { latest, changes, quiet, total } = view;

  return (
    <Card>
      <Text style={[styles.eyebrow, styles.headSpace, { color: t('fg-4') }]}>
        Daily decisions · what each strategy chose
      </Text>

      <View style={styles.strategies}>
        {Object.entries(latest.strategies ?? {}).map(([name, s]) => (
          <View key={name}>
            <View style={styles.strategyRow}>
              <Text style={[styles.strategyName, { color: t('fg-1') }]}>
                {stratName(name)}
                {s.enabled === false ? (
                  <Text style={[styles.practice, { color: t('fg-3') }]}> · practice</Text>
                ) : null}
              </Text>
              {s.weight != null ? (
                <Text style={[styles.weight, { color: t('fg-3') }]}>
                  {Math.round(s.weight * 100)}% of book
                </Text>
              ) : null}
            </View>
            <Chips targets={s.targets} />
          </View>
        ))}
      </View>

      <View style={[styles.changes, { borderTopColor: t('border') }]}>
        <Text style={[styles.eyebrow, styles.changesHead, { color: t('fg-4') }]}>
          {changesHeader(total)}
        </Text>
        {changes.length === 0 ? (
          <Text style={[styles.cashLine, { color: t('fg-3') }]}>{noChangesLine(quiet)}</Text>
        ) : (
          <View style={styles.changeRows}>
            {changes.map((d) => (
              <View key={d.day} style={styles.changeRow}>
                <Text style={[styles.changeDay, { color: t('fg-3') }]}>{dateLabelWeekday(d.day)}</Text>
                {/* `whitespace-nowrap` per symbol plus ml-[8px] becomes a
                    right-aligned wrap row: each entry stays whole, the row
                    wraps between entries. */}
                <View style={styles.changeSyms}>
                  {d.changed.added.map((s) => (
                    <Text key={`+${s}`} style={[styles.changeSym, { color: t('fg-2') }]}>
                      <Text style={{ color: t('accent') }}>+</Text> {symName(s)}
                    </Text>
                  ))}
                  {d.changed.dropped.map((s) => (
                    <Text key={`-${s}`} style={[styles.changeSym, { color: t('fg-2') }]}>
                      <Text style={{ color: t('fg-4') }}>−</Text> {symName(s)}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
            {quiet > 0 ? (
              <Text style={[styles.quietTail, { color: t('fg-4') }]}>{quietTailLine(quiet)}</Text>
            ) : null}
          </View>
        )}
      </View>

      <Text style={[styles.footer, { color: t('fg-4') }]}>
        as of {dateLabelWeekday(latest.day)} · each strategy’s own targets, before they are blended
        into the book
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: fonts.mono(400),
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headSpace: { marginBottom: 10 },
  strategies: { rowGap: 11 },
  strategyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  strategyName: { fontFamily: fonts.sans(550), fontSize: 13, flexShrink: 1 },
  // Inside the 550-weight strategy name, so the PWA's nested span inherits
  // 550; RN has no inheritance across an explicit fontFamily, hence the 550.
  practice: { fontFamily: fonts.sans(550), fontSize: 11 },
  weight: { fontFamily: fonts.mono(400), fontSize: 11, ...MONO_FEATURES },
  cashLine: { fontFamily: fonts.sans(400), fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipName: { fontFamily: fonts.sans(400), fontSize: 12.5 },
  chipPct: { fontFamily: fonts.mono(400), fontSize: 12, ...MONO_FEATURES },
  changes: { marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
  changesHead: { marginBottom: 6 },
  changeRows: { rowGap: 5 },
  changeRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  changeDay: { fontFamily: fonts.mono(400), fontSize: 11 },
  changeSyms: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    columnGap: 8,
    rowGap: 2,
    flexShrink: 1,
  },
  changeSym: { fontFamily: fonts.sans(400), fontSize: 12, textAlign: 'right' },
  quietTail: { fontFamily: fonts.sans(400), fontSize: 11.5, marginTop: 1 },
  footer: { fontFamily: fonts.mono(400), fontSize: 10, marginTop: 10 },
});
