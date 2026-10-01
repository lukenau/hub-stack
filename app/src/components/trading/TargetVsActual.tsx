import { StyleSheet, Text, View } from 'react-native';
import type { TradingExplain, TradingPerf } from '../../lib/types';
import { symName } from '../../shared/symbols';
import { targetRows } from '../../shared/targets';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { Card } from '../shell';

// Is the book where it wants to be? This card independently catches a leg that
// was decided but never filled — the 2026-08-04 failure, where the multi-asset
// sleeve sat at 0% for two days while every other surface looked healthy.
//
// Two aligned columns rather than a sentence per row: at 390px a run-on row
// squeezed the instrument name down to about ten characters on exactly the
// rows that were sounding an alarm. One decimal place on both columns, because
// rounding each to a whole number independently manufactured gaps that did not
// exist — 12.5 against 12.493 rendered as "13% vs 12%", a full point of pure
// display artifact on a card whose entire job is to be trusted about gaps.
//
// Red is reserved for the two states worth acting on: wanted-but-absent, and
// materially off target. Ordinary drift stays quiet, or the colour stops
// meaning anything.
//
// Port of apps/hub/src/components/trading/TargetVsActual.tsx. Not a chart in
// the PWA either — a CSS grid of text, so a row of Views carries it over.

const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

export interface TargetVsActualProps {
  perf: TradingPerf;
  explain?: TradingExplain | null;
}

export function TargetVsActual({ perf, explain }: TargetVsActualProps) {
  const { t } = useTheme();
  const rows = targetRows(explain?.targets, perf.positions, perf.prices, perf.equity);

  return (
    <Card>
      <Text style={[styles.header, { color: t('fg-4') }]}>Target vs actual</Text>

      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: t('fg-4') }]}>
          no decision cycle yet today — targets appear after the first one
        </Text>
      ) : (
        <>
          <View style={styles.headRow}>
            <View style={styles.nameCell} />
            <Text style={[styles.headCell, { color: t('fg-4') }]}>wants</Text>
            <Text style={[styles.headCell, { color: t('fg-4') }]}>holds</Text>
          </View>

          <View style={styles.rows}>
            {rows.map((r) => {
              const off = r.unfilled || r.drifted;
              const tone = off ? t('status-down') : t('fg-1');
              return (
                <View key={r.symbol}>
                  <View style={styles.row}>
                    <Text numberOfLines={1} style={[styles.name, styles.nameCell, { color: tone }]}>
                      {symName(r.symbol)}
                    </Text>
                    <Text style={[styles.value, { color: t('fg-2') }]}>{pct(r.wants)}</Text>
                    <Text style={[styles.value, { color: tone }]}>{pct(r.holds)}</Text>
                  </View>
                  {r.unfilled && (
                    <Text style={[styles.note, { color: t('status-down') }]}>
                      not filled — it decided this and the order never went through
                    </Text>
                  )}
                  {r.drifted && (
                    <Text style={[styles.note, { color: t('status-down') }]}>
                      off target by {Math.abs(r.gap ?? 0).toFixed(1)} points
                    </Text>
                  )}
                  {r.holds == null && (
                    <Text style={[styles.note, { color: t('fg-3') }]}>
                      held, but there’s no price right now to value it with
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          <Text style={[styles.footer, { color: t('fg-4') }]}>
            wants = what the strategies blend to · holds = its share of the account now
          </Text>
        </>
      )}
    </Card>
  );
}

const CELL_W = 52;

const styles = StyleSheet.create({
  header: {
    fontFamily: fonts.mono(400),
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  empty: { fontFamily: fonts.mono(400), fontSize: 10.5 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', columnGap: 10, marginBottom: 4 },
  headCell: {
    width: CELL_W,
    textAlign: 'right',
    fontFamily: fonts.mono(400),
    fontSize: 9.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  rows: { rowGap: 5 },
  row: { flexDirection: 'row', alignItems: 'baseline', columnGap: 10 },
  nameCell: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.sans(550), fontSize: 13 },
  value: {
    width: CELL_W,
    textAlign: 'right',
    fontFamily: fonts.mono(400),
    fontSize: 12,
    ...MONO_FEATURES,
  },
  note: { fontSize: 11.5, lineHeight: 16.1, marginTop: 1, fontFamily: fonts.sans(400) },
  footer: { marginTop: 8, fontFamily: fonts.mono(400), fontSize: 10 },
});
