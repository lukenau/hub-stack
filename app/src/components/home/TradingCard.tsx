// Trading status (TradingCard.tsx:28-256). A risk-halted trader is a "needs
// eyes" state, so Home moves this card above the fold when `halted` is set —
// that switch lives in the Home composition, not here.
//
// The card body is not tappable: "open trading" is the one target, as in the
// PWA. The five `title=` tooltips the PWA carries are desktop-hover only and
// were already unreachable on iOS; they are not reproduced.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { SymbolView } from 'expo-symbols';
import type { TradingPerf, TradingStatus } from '../../lib/types';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { PRESSED_OPACITY } from '../shell';
import {
  SPARK_H,
  SPARK_W,
  TRADING_OFFLINE_LINE,
  sparkline,
  sparklineLabel,
  tradingCardState,
  tradingCardView,
} from './tradingCardModel';

function Sparkline({ curve }: { curve: { date: string; equity: number }[] }) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  // The PWA's SVG keeps its 280×36 viewBox aspect (default preserveAspectRatio),
  // so the line never stretches past 280 however wide the card is.
  const w = width > 0 ? Math.min(width, SPARK_W) : 0;
  const spark = w > 0 ? sparkline(curve, w, SPARK_H) : null;
  return (
    <View style={styles.sparkHost} onLayout={onLayout}>
      {spark ? (
        <Canvas
          style={{ width: w, height: SPARK_H }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={sparklineLabel(curve)}
        >
          <Path
            path={spark.path}
            style="stroke"
            strokeWidth={2}
            strokeJoin="round"
            strokeCap="round"
            color={t('series-1')}
          />
          <Circle cx={spark.end.x} cy={spark.end.y} r={3} color={t('series-1')} />
          <Circle
            cx={spark.end.x}
            cy={spark.end.y}
            r={3}
            style="stroke"
            strokeWidth={2}
            color={t('bg-1')}
          />
        </Canvas>
      ) : null}
    </View>
  );
}

export function TradingCard({
  trading,
  perf,
}: {
  trading: TradingStatus | null | undefined;
  perf?: TradingPerf | null;
}) {
  const { t } = useTheme();
  const state = tradingCardState(trading);
  if (state === 'hidden' || !trading) return null;

  if (state === 'offline') {
    return (
      <View style={styles.offline}>
        <View style={[styles.offlineDot, { backgroundColor: t('fg-4') }]} />
        <Text style={[styles.offlineText, { color: t('fg-4') }]}>{TRADING_OFFLINE_LINE}</Text>
      </View>
    );
  }

  const v = tradingCardView(trading, perf);
  const pnlColor = (positive: boolean) => (positive ? t('status-up') : t('status-down'));

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t('bg-1'),
          borderColor: v.halted ? t('status-down-border-strong') : t('border'),
          borderLeftColor: v.halted ? t('status-down') : t(v.tone.rail),
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={[styles.eyebrow, { color: t('fg-3') }]}>Trading · spindle</Text>
        <Text
          style={[
            styles.badge,
            { backgroundColor: t(v.tone.soft), borderColor: t(v.tone.border), color: t(v.tone.color) },
          ]}
        >
          {v.badgeLabel}
        </Text>
      </View>

      {v.halted ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.halted,
            { backgroundColor: t('status-down-soft'), borderColor: t('status-down-border-strong') },
          ]}
        >
          <View style={styles.haltedHead}>
            <SymbolView
              name="exclamationmark.triangle"
              size={16}
              tintColor={t('status-down')}
              weight="semibold"
            />
            <Text style={[styles.haltedTitle, { color: t('status-down') }]}>HALTED — {v.halted}</Text>
          </View>
          <Text style={[styles.haltedDetail, { color: t('status-down') }]}>{v.haltedLine}</Text>
        </View>
      ) : null}

      {v.equityText ? (
        <View style={styles.headline}>
          <Text style={[styles.equity, { color: t('fg-0') }]}>{v.equityText}</Text>
          <Text style={[styles.equityLabel, { color: t(v.tone.color) }]}>{v.equityLabel}</Text>
          {v.scaleNote ? <Text style={[styles.scaleNote, { color: t('fg-4') }]}>{v.scaleNote}</Text> : null}
          {v.dayPnl ? (
            <Text style={[styles.pnl, { color: pnlColor(v.dayPnl.positive) }]}>{v.dayPnl.text}</Text>
          ) : null}
          {v.totalPnl ? (
            <Text style={[styles.pnl, { color: pnlColor(v.totalPnl.positive) }]}>{v.totalPnl.text}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.tradesLine, { color: t('fg-3') }]}>{v.tradesLine}</Text>
      )}

      {v.curve.length >= 2 ? <Sparkline curve={v.curve} /> : null}

      {v.positionsLine || v.lastOrderLine ? (
        <View style={styles.wrapRow}>
          {v.positionsLine ? (
            <Text style={[styles.wrapText, { color: t('fg-2') }]}>{v.positionsLine}</Text>
          ) : null}
          {v.lastOrderLine ? (
            <Text style={[styles.wrapText, { color: t('fg-3') }]}>{v.lastOrderLine}</Text>
          ) : null}
        </View>
      ) : null}

      {v.strategies.length > 0 ? (
        <View style={styles.wrapRowTight}>
          {v.strategies.map((s) => (
            <Text key={s.label} style={[styles.wrapText, { color: t('fg-3') }]}>
              {s.label}{' '}
              <Text style={{ color: pnlColor(s.ret.positive) }}>{s.ret.text}</Text>
              {s.practice ? ' · practice' : ''}
            </Text>
          ))}
        </View>
      ) : v.secondStrategyLine ? (
        <Text style={[styles.wrapText, styles.secondStrategy, { color: t('fg-3') }]}>
          {v.secondStrategyLine}
        </Text>
      ) : null}

      {/* Rendered even when empty, as the PWA's container is (TradingCard.tsx:218):
          its 6px top margin is part of the card's spacing either way. */}
      <View style={styles.wrapRowTight}>
        {v.footer.map((part) => (
          <Text key={part.text} style={[styles.wrapText, { color: part.tone ? t(part.tone) : t('fg-3') }]}>
            {part.text}
          </Text>
        ))}
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open trading"
        onPress={() => router.push('/trading')}
        style={({ pressed }) => [styles.link, pressed && { opacity: PRESSED_OPACITY }]}
      >
        <Text style={[styles.linkText, { color: t('accent') }]}>open trading</Text>
        <SymbolView name="chevron.right" size={12} tintColor={t('accent')} weight="semibold" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  offline: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 2, marginBottom: 12 },
  offlineDot: { width: 7, height: 7, borderRadius: 3.5 },
  offlineText: { fontFamily: fonts.mono(400), fontSize: 11 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  eyebrow: { fontFamily: fonts.mono(400), fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase' },
  badge: {
    fontFamily: fonts.mono(600),
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    overflow: 'hidden',
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  halted: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10 },
  haltedHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  haltedTitle: { fontFamily: fonts.sans(650), fontSize: 14, flexShrink: 1 },
  haltedDetail: { fontFamily: fonts.mono(400), fontSize: 10.5, marginTop: 4, opacity: 0.85 },
  headline: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  equity: { fontFamily: fonts.mono(550), fontSize: 26, letterSpacing: -0.52, ...MONO_FEATURES },
  equityLabel: { fontFamily: fonts.mono(400), fontSize: 10 },
  scaleNote: { fontFamily: fonts.mono(400), fontSize: 10, ...MONO_FEATURES },
  pnl: { fontFamily: fonts.mono(400), fontSize: 12, ...MONO_FEATURES },
  tradesLine: { fontFamily: fonts.mono(400), fontSize: 12 },
  sparkHost: { marginTop: 8, width: '100%' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 3, marginTop: 8 },
  wrapRowTight: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 3, marginTop: 6 },
  wrapText: { fontFamily: fonts.mono(400), fontSize: 11, ...MONO_FEATURES },
  secondStrategy: { marginTop: 6 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 8,
    minHeight: 28,
  },
  linkText: { fontFamily: fonts.mono(400), fontSize: 10.5 },
});
