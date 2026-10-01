import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Circle,
  Group,
  Line,
  Path,
  Text as SkiaText,
  useFont,
  vec,
  type SkFont,
} from '@shopify/react-native-skia';
import type { TradingPerf, TradingStatus } from '../../lib/types';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { Card } from '../shell';
import {
  EQUITY_H,
  EQUITY_M,
  EQUITY_W,
  day,
  endLabelPos,
  equityAriaLabel,
  equityLayout,
  equityView,
  equityY,
  isPaper,
  nearestIndex,
  readoutX,
  usd0,
  usd2,
  viewBoxX,
} from './geometry';

// Paper-account headline + a real equity line chart (dataviz method): 2px line
// in the single series hue, ~10% area wash, hairline gridlines at clean dollar
// ticks, first/last date labels, 8px end-dot with a surface ring, and a
// crosshair that snaps to the nearest day — value leads, date follows. One
// series, so the card title is the legend. Headline is the *_display number;
// the raw account-scale figure stays secondary.
//
// Port of apps/hub/src/components/trading/EquityChart.tsx. The `viewBox` is
// reproduced by scaling a 360×150 Group to the measured width, so every
// coordinate below is still a viewBox coordinate; the pointer scrub becomes a
// horizontal Pan that yields to vertical scrolling (the PWA's
// `touch-action: pan-y`) and maps the touch back through that same scale.

const SANS_400 = require('../../../assets/fonts/HubOnest-400.ttf');
const SANS_600 = require('../../../assets/fonts/HubOnest-600.ttf');
const AXIS_FONT_SIZE = 9;
const READOUT_FONT_SIZE = 10;

export interface EquityChartProps {
  perf: TradingPerf;
  trading?: TradingStatus | null;
}

export function EquityChart({ perf, trading }: EquityChartProps) {
  const { t } = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const axisFont = useFont(SANS_400, AXIS_FONT_SIZE);
  const readoutFont = useFont(SANS_600, READOUT_FONT_SIZE);
  const readoutDateFont = useFont(SANS_400, READOUT_FONT_SIZE);

  const { divisor, scaled, curve, equity, dayPnl, totalPnl } = equityView(perf);
  const paper = isPaper(trading);
  const moneyLabel = paper ? 'paper money' : 'money at the broker';
  const hasChart = curve.length >= 2;

  const layout = equityLayout(hasChart ? curve : []);
  const scale = width > 0 ? width / EQUITY_W : 0;
  const last = curve[curve.length - 1];
  const hp = hover != null ? curve[hover] : null;
  const hoverPoint = hover != null ? layout.points[hover] : null;
  const endPoint = hasChart ? layout.points[layout.n - 1] : null;

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-8, 8])
    .runOnJS(true)
    .onBegin((e) => setHover(nearestIndex(viewBoxX(e.x, width), curve.length)))
    .onUpdate((e) => setHover(nearestIndex(viewBoxX(e.x, width), curve.length)))
    .onFinalize(() => setHover(null));

  if (equity == null && curve.length < 2) return null;

  return (
    <Card>
      {equity != null && (
        <View style={styles.headlineRow}>
          <Text style={[styles.headline, { color: t('fg-0') }]}>{usd2(equity)}</Text>
          <Text style={[styles.moneyLabel, { color: t('fg-3') }]}>{moneyLabel}</Text>
          {scaled && perf.equity != null && (
            <Text style={[styles.scaleNote, { color: t('fg-4') }]}>
              (×{divisor} account scale: {usd0(perf.equity)})
            </Text>
          )}
        </View>
      )}

      {(dayPnl != null || totalPnl != null) && (
        <View style={styles.pnlRow}>
          {dayPnl != null && (
            <Text style={[styles.pnl, { color: t(dayPnl >= 0 ? 'status-up' : 'status-down') }]}>
              {dayPnl >= 0 ? '+' : '−'}
              {usd2(Math.abs(dayPnl))} today
            </Text>
          )}
          {totalPnl != null && (
            <Text style={[styles.pnl, { color: t(totalPnl >= 0 ? 'status-up' : 'status-down') }]}>
              {totalPnl >= 0 ? '+' : '−'}
              {usd2(Math.abs(totalPnl))}
              {perf.since ? ` since ${day(perf.since)}` : ' overall'}
            </Text>
          )}
        </View>
      )}

      {hasChart && (
        <GestureDetector gesture={pan}>
          <View
            style={styles.chart}
            onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
            accessible
            accessibilityRole="image"
            accessibilityLabel={equityAriaLabel(curve)}
          >
            {width > 0 && (
              <Canvas style={{ width, height: EQUITY_H * scale }}>
                <Group transform={[{ scale }]}>
                  {/* gridlines + y ticks — recessive, clean dollars */}
                  {layout.ticks.map((tick) => {
                    const ty = equityY(tick, layout.dMin, layout.dMax);
                    return (
                      <Group key={tick}>
                        <Line
                          p1={vec(EQUITY_M.l, ty)}
                          p2={vec(EQUITY_W - EQUITY_M.r, ty)}
                          color={t('border')}
                          style="stroke"
                          strokeWidth={1}
                        />
                        {axisFont && (
                          <SkiaText
                            x={EQUITY_M.l - 6 - axisFont.measureText(usd0(tick)).width}
                            y={ty + 3}
                            text={usd0(tick)}
                            font={axisFont}
                            color={t('fg-4')}
                          />
                        )}
                      </Group>
                    );
                  })}

                  {layout.areaPath && (
                    <Path path={layout.areaPath} color={t('series-1')} opacity={0.1} />
                  )}
                  {layout.linePath && (
                    <Path
                      path={layout.linePath}
                      color={t('series-1')}
                      style="stroke"
                      strokeWidth={2}
                      strokeJoin="round"
                      strokeCap="round"
                    />
                  )}

                  {/* crosshair — value leads, date follows */}
                  {hp && hoverPoint && (
                    <Group>
                      <Line
                        p1={vec(hoverPoint.x, EQUITY_M.t)}
                        p2={vec(hoverPoint.x, EQUITY_H - EQUITY_M.b)}
                        color={t('fg-4')}
                        style="stroke"
                        strokeWidth={1}
                      />
                      <Dot x={hoverPoint.x} y={hoverPoint.y} fill={t('series-1')} ring={t('bg-1')} />
                      {readoutFont && readoutDateFont && (
                        <Readout
                          x={readoutX(hoverPoint.x)}
                          y={EQUITY_M.t - 2}
                          value={usd2(hp.equity)}
                          date={` · ${day(hp.date)}`}
                          valueFont={readoutFont}
                          dateFont={readoutDateFont}
                          valueColor={t('fg-1')}
                          dateColor={t('fg-4')}
                        />
                      )}
                    </Group>
                  )}

                  {/* end-dot + direct label on the latest point (hidden while scrubbing) */}
                  {hover == null && endPoint && (
                    <Group>
                      <Dot x={endPoint.x} y={endPoint.y} fill={t('series-1')} ring={t('bg-1')} />
                      {readoutFont && (
                        <EndLabel
                          point={endPoint}
                          text={usd0(last.equity)}
                          font={readoutFont}
                          color={t('fg-1')}
                        />
                      )}
                    </Group>
                  )}

                  {/* x labels: first + last day */}
                  {axisFont && (
                    <Group>
                      <SkiaText
                        x={EQUITY_M.l}
                        y={EQUITY_H - 6}
                        text={day(curve[0].date)}
                        font={axisFont}
                        color={t('fg-4')}
                      />
                      <SkiaText
                        x={EQUITY_W - EQUITY_M.r - axisFont.measureText(day(last.date)).width}
                        y={EQUITY_H - 6}
                        text={day(last.date)}
                        font={axisFont}
                        color={t('fg-4')}
                      />
                    </Group>
                  )}
                </Group>
              </Canvas>
            )}
          </View>
        </GestureDetector>
      )}

      <Text style={[styles.footer, { color: t('fg-4') }]}>
        account value at each day's close{paper ? ' · practice account, not real money' : ''}
      </Text>
    </Card>
  );
}

/** 4px dot with a 2px surface ring — SVG paints the fill, then the stroke. */
function Dot({ x, y, fill, ring }: { x: number; y: number; fill: string; ring: string }) {
  return (
    <Group>
      <Circle c={vec(x, y)} r={4} color={fill} />
      <Circle c={vec(x, y)} r={4} color={ring} style="stroke" strokeWidth={2} />
    </Group>
  );
}

/** The PWA's `<text>` + `<tspan>`: one centred line, two colours, two weights. */
function Readout({
  x,
  y,
  value,
  date,
  valueFont,
  dateFont,
  valueColor,
  dateColor,
}: {
  x: number;
  y: number;
  value: string;
  date: string;
  valueFont: SkFont;
  dateFont: SkFont;
  valueColor: string;
  dateColor: string;
}) {
  const valueW = valueFont.measureText(value).width;
  const start = x - (valueW + dateFont.measureText(date).width) / 2;
  return (
    <Group>
      <SkiaText x={start} y={y} text={value} font={valueFont} color={valueColor} />
      <SkiaText x={start + valueW} y={y} text={date} font={dateFont} color={dateColor} />
    </Group>
  );
}

/** Direct label on the latest point, anchored end (Skia draws from the left). */
function EndLabel({
  point,
  text,
  font,
  color,
}: {
  point: { x: number; y: number };
  text: string;
  font: SkFont;
  color: string;
}) {
  const pos = endLabelPos(point.x, point.y);
  return (
    <SkiaText
      x={pos.x - font.measureText(text).width}
      y={pos.y}
      text={text}
      font={font}
      color={color}
    />
  );
}

const styles = StyleSheet.create({
  headlineRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10 },
  headline: { fontFamily: fonts.mono(550), fontSize: 27, letterSpacing: -0.54 },
  moneyLabel: { fontFamily: fonts.mono(400), fontSize: 10.5 },
  scaleNote: { fontFamily: fonts.mono(400), fontSize: 10, ...MONO_FEATURES },
  pnlRow: { marginTop: 3, flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  pnl: { fontFamily: fonts.mono(400), fontSize: 12, ...MONO_FEATURES },
  chart: { marginTop: 10, width: '100%' },
  footer: { marginTop: 6, fontFamily: fonts.mono(400), fontSize: 10 },
});
