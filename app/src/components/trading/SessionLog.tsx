// One line per trading session, newest first, past tense. Replaces a per-tick
// rhythm strip that measurement killed: order_emission became daily on
// 2026-08-04, collapsing all gate activity into a single tick per session, so
// every future row would have been 77 identical cells and one — a wall of
// pixels carrying about one bit.
//
// The verb is the signal. "held" and "frozen" both mean nothing was bought, and
// the whole point is that they are not the same thing.
//
// Port of apps/hub/src/components/trading/SessionLog.tsx. The PWA's rotating
// "›" glyph becomes the SF Symbol chevron the rest of the app already uses for
// a disclosure (system/CollapseHead.tsx), on the same 120ms rotation; its
// hover-only `title` notes are desktop-only and are not reproduced.
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { TradingPerf, TradingSession } from '../../lib/types';
import { sessionMoves } from '../../shared/sessions';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { Card, useReducedMotion } from '../shell';
import {
  dateLabelWeekday,
  moveText,
  sessionDetail,
  tradeLine,
  VERB_TONE,
} from './tradingFormat';

/** `transition: transform 120ms` (SessionLog.tsx:114-119). */
const ROTATE_MS = 120;

function Chevron({ open }: { open: boolean }) {
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
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  return (
    <Animated.View style={[styles.chevron, { transform: [{ rotate }] }]}>
      <SymbolView name="chevron.right" size={10} tintColor={t('fg-4')} weight="regular" />
    </Animated.View>
  );
}

export interface SessionLogProps {
  sessions: TradingSession[] | null | undefined;
  perf?: TradingPerf | null;
}

export function SessionLog({ sessions, perf }: SessionLogProps) {
  const { t } = useTheme();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!sessions || sessions.length === 0) return null;
  const moves = sessionMoves(sessions, perf?.display_divisor);

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: t('fg-4') }]}>Session log</Text>

      <View style={styles.rows}>
        {sessions
          .slice()
          .reverse()
          .map((s) => {
            const move = moves.get(s.day) ?? null;
            const trades = s.trades ?? [];
            const expandable = trades.length > 0;
            const isOpen = expandable && !!open[s.day];
            const toggle = () => setOpen((o) => ({ ...o, [s.day]: !o[s.day] }));
            return (
              <View key={s.day}>
                <Pressable
                  onPress={expandable ? toggle : undefined}
                  disabled={!expandable}
                  accessibilityRole={expandable ? 'button' : undefined}
                  accessibilityLabel={expandable ? 'toggle session trades' : undefined}
                  accessibilityState={expandable ? { expanded: isOpen } : undefined}
                  style={styles.row}
                >
                  <View style={styles.rowLeft}>
                    <Text style={[styles.rowText, { color: t('fg-2') }]}>
                      <Text style={[styles.day, { color: t('fg-4') }]}>{dateLabelWeekday(s.day)}</Text>{' '}
                      <Text style={[styles.verb, { color: t(VERB_TONE[s.verb] ?? 'fg-2') }]}>
                        {s.verb}
                      </Text>
                      <Text style={{ color: t('fg-3') }}> — {sessionDetail(s)}</Text>
                    </Text>
                    {expandable ? <Chevron open={isOpen} /> : null}
                  </View>
                  {/* Green and red claim the move is the agent's doing, so only
                      a session that traded cleanly earns them. */}
                  {move != null ? (
                    <Text
                      style={[
                        styles.move,
                        {
                          color: !move.traded
                            ? t('fg-3')
                            : move.amount >= 0
                              ? t('status-up')
                              : t('status-down'),
                        },
                      ]}
                    >
                      {moveText(move.amount)}
                    </Text>
                  ) : null}
                </Pressable>
                {isOpen ? (
                  <View style={styles.trades}>
                    {trades.map((tr, i) => (
                      <Text key={`${tr.ts}-${i}`} style={[styles.trade, { color: t('fg-3') }]}>
                        {tradeLine(tr)}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerLine, { color: t('fg-4') }]}>
          close to close at display scale, so these add up to the curve above
        </Text>
        <Text style={[styles.footerLine, { color: t('fg-4') }]}>
          green or red only when the session traded cleanly · grey = frozen, refused, or nothing to do
        </Text>
        <Text style={[styles.footerLine, { color: t('fg-4') }]}>
          “held” means it had nothing to change, “frozen” means it couldn’t
        </Text>
      </View>
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
  rows: { rowGap: 7 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  rowLeft: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 1, minWidth: 0 },
  rowText: { fontFamily: fonts.sans(400), fontSize: 12.5, flexShrink: 1 },
  day: { fontFamily: fonts.mono(400), fontSize: 11 },
  verb: { fontFamily: fonts.sans(550) },
  chevron: { marginLeft: 6 },
  move: { fontFamily: fonts.mono(400), fontSize: 11, ...MONO_FEATURES },
  trades: { rowGap: 3, marginTop: 3, marginBottom: 2, paddingLeft: 10 },
  trade: { fontFamily: fonts.mono(400), fontSize: 11, ...MONO_FEATURES },
  footer: { marginTop: 8 },
  footerLine: { fontFamily: fonts.mono(400), fontSize: 10, lineHeight: 15 },
});
