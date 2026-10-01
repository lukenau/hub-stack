// ETF look-through: what the paper book's ETF positions translate to in
// individual stocks (the user: "individual stock exposure pcts so i can see what
// they actually mean"). Data = GET /api/trading/exposure — daily issuer
// holdings x live spindle positions. Dataviz method: bar length carries
// magnitude (% of book); color carries identity (fixed --series slot per ETF,
// the headline rows double as the legend); text wears text tokens only.
//
// The single-stock list is ranked by book weight and capped, which makes it
// silently concentration-biased — see src/shared/exposure.ts. It therefore
// ships with its coverage and with a named line for every held ETF it cannot
// reach.
//
// Port of apps/hub/src/components/trading/ExposureCard.tsx. The bars are the
// PWA's own CSS boxes, not a chart: `max(2px, pct/max*100%)` becomes a
// percentage width with a 2px minWidth, which is the same rule.
import { Fragment, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { TradingExposure } from '../../lib/types';
import { bookLines, unrepresented } from '../../shared/exposure';
import { etfColor, SYMBOL_NAMES } from '../../shared/symbols';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import type { TokenName } from '../../theme/tokens.gen';
import { useTheme } from '../../theme/useTheme';
import { Card, useReducedMotion } from '../shell';
import { etfFooter, fmtPct, titleCase, viaLine } from './tradingFormat';

/** `transition: transform var(--dur-fast)` — tokens.css:238 is 120ms. */
const ROTATE_MS = 120;

function Bar({ segments, max }: { segments: { color: TokenName; pct: number }[]; max: number }) {
  const { t } = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bar}>
      {segments.map((s, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            {
              width: `${(s.pct / max) * 100}%`,
              backgroundColor: t(s.color),
              borderTopRightRadius: i === segments.length - 1 ? 2 : 0,
              borderBottomRightRadius: i === segments.length - 1 ? 2 : 0,
            },
          ]}
        />
      ))}
    </View>
  );
}

function EtfChevron({ open }: { open: boolean }) {
  const { t } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reduceMotion ? 0 : ROTATE_MS,
      useNativeDriver: true,
    }).start();
  }, [open, progress, reduceMotion]);
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <SymbolView name="chevron.down" size={12} tintColor={t('fg-4')} weight="semibold" />
    </Animated.View>
  );
}

export function ExposureCard({ exposure }: { exposure: TradingExposure | null | undefined }) {
  const { t } = useTheme();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [openEtf, setOpenEtf] = useState<string | null>(null);
  if (!exposure) return null;

  const perEtf = Object.entries(exposure.per_etf);
  const lines = bookLines(exposure);
  if (lines.length === 0) return null;

  const book = exposure.book;
  const maxPct = Math.max(...book.map((r) => r.book_pct), 0.0001);
  const maxLine = Math.max(...lines.map((l) => l.pct), 0.0001);
  const asOf = [...new Set(perEtf.map(([, e]) => e.as_of).filter(Boolean))].join(', ');
  const coverage = exposure.coverage;
  const missing = unrepresented(exposure);

  return (
    <Card>
      {/* The whole book, biggest sleeve first — these rows are also the legend
          (dot = series slot). Ranked together so a 25% cash sleeve cannot end up
          printed below a 20% equity one. */}
      <Text style={[styles.eyebrow, styles.eyebrowSpace, { color: t('fg-4') }]}>
        The book · {lines.length} sleeves
      </Text>
      <View style={styles.lines}>
        {lines.map((l) => (
          <View key={l.etf}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.dot7, { backgroundColor: t(etfColor(l.etf) as TokenName) }]} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.sleeve,
                    l.equity ? styles.sleeveEquity : null,
                    { color: l.equity ? t('fg-1') : t('fg-2') },
                  ]}
                >
                  {l.etf} {SYMBOL_NAMES[l.etf] ?? ''}
                  {l.describes ? (
                    <Text style={[styles.describes, { color: t('fg-3') }]}> {l.describes}</Text>
                  ) : null}
                </Text>
              </View>
              <Text style={[styles.mono12, { color: t('fg-2') }]}>
                {Math.round(l.pct)}% of book
              </Text>
            </View>
            <Bar segments={[{ color: etfColor(l.etf) as TokenName, pct: l.pct }]} max={maxLine} />
          </View>
        ))}
      </View>

      {book.length > 0 ? (
        <>
          <Text
            style={[
              styles.eyebrow,
              styles.stocksHead,
              coverage ? null : styles.stocksHeadNoCoverage,
              { color: t('fg-4') },
            ]}
          >
            Biggest single stocks · top {book.length}
          </Text>
          {coverage ? (
            <Text style={[styles.coverage, { color: t('fg-3') }]}>
              these {coverage.shown} names are{' '}
              <Text style={[styles.coveragePct, { color: t('fg-2') }]}>
                {fmtPct(coverage.shown_pct)}
              </Text>{' '}
              of the book — the rest sits in the sleeves above
            </Text>
          ) : null}
          <View>
            {book.map((r) => {
              const key = `${r.ticker}·${r.name}`;
              const open = openRow === key;
              return (
                <Fragment key={key}>
                  <Pressable
                    onPress={() => setOpenRow(open ? null : key)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    style={styles.stockRow}
                  >
                    <View style={styles.row}>
                      <Text numberOfLines={1} style={[styles.stockName, { color: t('fg-1') }]}>
                        {titleCase(r.name)}{' '}
                        <Text style={[styles.ticker, { color: t('fg-4') }]}>{r.ticker}</Text>
                      </Text>
                      <Text style={[styles.mono12, { color: t('fg-1') }]}>{fmtPct(r.book_pct)}</Text>
                    </View>
                    <Bar
                      segments={r.via.map((v) => ({
                        color: etfColor(v.etf) as TokenName,
                        pct: v.contrib_pct,
                      }))}
                      max={maxPct}
                    />
                  </Pressable>
                  {open ? (
                    <View style={styles.via}>
                      {r.via.map((v) => (
                        <View key={v.etf} style={styles.viaRow}>
                          <View
                            style={[styles.dot5, { backgroundColor: t(etfColor(v.etf) as TokenName) }]}
                          />
                          <Text style={[styles.mono11, { color: t('fg-3') }]}>{viaLine(v)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Fragment>
              );
            })}
          </View>

          {/* Why a 30%-of-book sleeve can be missing from the list above. */}
          {missing.map((m) => (
            <View key={m.etf} style={styles.missingRow}>
              <View style={[styles.dot7, styles.missingDot, { backgroundColor: t(etfColor(m.etf) as TokenName) }]} />
              <Text style={[styles.missing, { color: t('fg-3') }]}>
                {m.etf} {SYMBOL_NAMES[m.etf] ?? ''} is {Math.round(m.pct)}% of the book but reaches
                none of these rows: its {m.names} largest holdings are spread thin, so its biggest
                single name is only{' '}
                <Text style={[styles.coveragePct, { color: t('fg-2') }]}>{fmtPct(m.maxNamePct)}</Text>{' '}
                of the book. Open it below to see inside.
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {/* Per-ETF top-10s (fund weights, not book weights) */}
      {perEtf.length > 0 ? (
        <View style={[styles.etfs, { borderTopColor: t('border') }]}>
          {perEtf.map(([etf, e]) => {
            const open = openEtf === etf;
            const etfMax = Math.max(...e.top10.map((h) => h.weight_pct), 0.0001);
            return (
              <Fragment key={etf}>
                <Pressable
                  onPress={() => setOpenEtf(open ? null : etf)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={styles.etfHead}
                >
                  <View style={styles.rowLeft}>
                    <View style={[styles.dot5, { backgroundColor: t(etfColor(etf) as TokenName) }]} />
                    <Text style={[styles.insideLabel, { color: t('fg-3') }]}>
                      inside {etf} · top 10 of fund
                    </Text>
                  </View>
                  <EtfChevron open={open} />
                </Pressable>
                {open ? (
                  <View style={styles.holdings}>
                    {e.top10.map((h) => (
                      <View key={`${h.ticker}·${h.name}`} style={styles.holding}>
                        <View style={styles.row}>
                          <Text numberOfLines={1} style={[styles.holdingName, { color: t('fg-2') }]}>
                            {titleCase(h.name)}{' '}
                            <Text style={[styles.holdingTicker, { color: t('fg-4') }]}>{h.ticker}</Text>
                          </Text>
                          <Text style={[styles.mono11, { color: t('fg-2') }]}>
                            {fmtPct(h.weight_pct)}
                          </Text>
                        </View>
                        <Bar
                          segments={[{ color: etfColor(etf) as TokenName, pct: h.weight_pct }]}
                          max={etfMax}
                        />
                      </View>
                    ))}
                    <Text style={[styles.mono10, styles.holdingFooter, { color: t('fg-4') }]}>
                      {etfFooter(e)}
                    </Text>
                  </View>
                ) : null}
              </Fragment>
            );
          })}
        </View>
      ) : null}

      {exposure.notes.length > 0 ? (
        <Text style={[styles.mono105, styles.notes, { color: t('status-warn') }]}>
          {exposure.notes.join(' · ')}
        </Text>
      ) : null}

      <Text style={[styles.mono10, styles.footer, { color: t('fg-4') }]}>
        issuer holdings as of {asOf || '—'} · positions live from spindle · % of paper book
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
  eyebrowSpace: { marginBottom: 8 },
  lines: { rowGap: 7 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  dot7: { width: 7, height: 7, borderRadius: 3.5 },
  dot5: { width: 5, height: 5, borderRadius: 2.5 },
  sleeve: { fontFamily: fonts.sans(400), fontSize: 13.5, flexShrink: 1 },
  sleeveEquity: { fontFamily: fonts.sans(550) },
  describes: { fontFamily: fonts.sans(400), fontSize: 11 },
  mono12: { fontFamily: fonts.mono(400), fontSize: 12, ...MONO_FEATURES },
  mono11: { fontFamily: fonts.mono(400), fontSize: 11, ...MONO_FEATURES },
  mono105: { fontFamily: fonts.mono(400), fontSize: 10.5 },
  mono10: { fontFamily: fonts.mono(400), fontSize: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 4, marginTop: 3 },
  segment: { height: 4, minWidth: 2 },
  stocksHead: { marginTop: 16 },
  stocksHeadNoCoverage: { marginBottom: 7 },
  coverage: { fontFamily: fonts.sans(400), fontSize: 11.5, marginTop: 3, marginBottom: 7 },
  coveragePct: { fontFamily: fonts.mono(400), ...MONO_FEATURES },
  stockRow: { paddingVertical: 5 },
  stockName: { fontFamily: fonts.sans(400), fontSize: 12.5, flexShrink: 1 },
  ticker: { fontFamily: fonts.mono(400), fontSize: 10 },
  via: { paddingBottom: 6, rowGap: 2 },
  viaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  missingRow: { flexDirection: 'row', marginTop: 8 },
  missingDot: { marginRight: 6, marginTop: 5 },
  missing: { fontFamily: fonts.sans(400), fontSize: 11.5, flexShrink: 1 },
  etfs: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, rowGap: 4 },
  etfHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 3,
  },
  insideLabel: {
    fontFamily: fonts.mono(400),
    fontSize: 10.5,
    letterSpacing: 1.05,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  holdings: { marginBottom: 4 },
  holding: { paddingVertical: 3 },
  holdingName: { fontFamily: fonts.sans(400), fontSize: 11.5, flexShrink: 1 },
  holdingTicker: { fontFamily: fonts.mono(400), fontSize: 9.5 },
  holdingFooter: { marginTop: 3 },
  notes: { marginTop: 8 },
  footer: { marginTop: 8 },
});
