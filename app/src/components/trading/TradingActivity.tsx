// Recent orders from the trading agent, newest first, in sentences: "Sold 5.76
// EEM Emerging Mkts (~$19) · 4d ago". Advisory "skipped" rows and order uuids
// are internal noise and never rendered; "pending_new" reads as "still
// filling". Dollar values are approximated from today's marked price (same
// approach as the journal's last-order notional), hence the ~. Advisory rows
// expand to the advisor's actual output (action / confidence / rationale),
// joined by session day from the derived log.
//
// Port of apps/hub/src/components/trading/TradingActivity.tsx. The card is the
// PWA's own 16/18×12 (not the shell Card's 18×14), and the rotating "›" glyph
// becomes the app's SF Symbol disclosure chevron.
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { TradingAdvisoryNote, TradingEvent, TradingPerf } from '../../lib/types';
import { relTime } from '../../shared/time';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { useReducedMotion } from '../shell';
import { ACTIVITY_PREVIEW, activityRows, advisoryLines, showMoreLabel } from './tradingFormat';

/** `transition: transform 120ms` (TradingActivity.tsx:105-111). */
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

function AdvisoryNote({ note }: { note: TradingAdvisoryNote }) {
  const { t } = useTheme();
  const lines = advisoryLines(note);
  return (
    <View style={styles.note}>
      <Text style={[styles.noteHead, { color: t('fg-2') }]}>{lines.head}</Text>
      {lines.rationale ? (
        <Text style={[styles.rationale, { color: t('fg-3') }]}>{lines.rationale}</Text>
      ) : null}
      {lines.wouldApply ? (
        <Text style={[styles.wouldApply, { color: t('fg-3') }]}>{lines.wouldApply}</Text>
      ) : null}
      <Text style={[styles.meta, { color: t('fg-4') }]}>{lines.meta}</Text>
    </View>
  );
}

export interface TradingActivityProps {
  events: TradingEvent[] | null | undefined;
  perf?: TradingPerf | null;
  advisory?: Record<string, TradingAdvisoryNote> | null;
}

export function TradingActivity({ events, perf, advisory }: TradingActivityProps) {
  const { t } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const [openAdvisory, setOpenAdvisory] = useState<Record<string, boolean>>({});
  if (!events || events.length === 0) return null;

  const orders = activityRows(events, perf, advisory);
  if (orders.length === 0) return null;
  const shown = showAll ? orders : orders.slice(0, ACTIVITY_PREVIEW);

  return (
    <View style={[styles.card, { backgroundColor: t('bg-1'), borderColor: t('border') }]}>
      <View>
        {shown.map((e, i) => {
          const note = e.advisory;
          const noteOpen = !!openAdvisory[e.key];
          const toggle = () => setOpenAdvisory((o) => ({ ...o, [e.key]: !o[e.key] }));
          return (
            <View
              key={`${e.key}-${i}`}
              style={
                i === shown.length - 1
                  ? undefined
                  : [styles.divider, { borderBottomColor: t('border') }]
              }
            >
              <Pressable
                onPress={note ? toggle : undefined}
                disabled={!note}
                accessibilityRole={note ? 'button' : undefined}
                accessibilityLabel={note ? 'toggle advisory output' : undefined}
                accessibilityState={note ? { expanded: noteOpen } : undefined}
                style={styles.row}
              >
                <View style={styles.rowLeft}>
                  <Text style={[styles.title, { color: t('fg-1') }]}>
                    {e.title}
                    {e.value ? (
                      <Text style={[styles.value, { color: t('fg-3') }]}> {e.value}</Text>
                    ) : null}
                    {e.filling ? (
                      <Text style={[styles.filling, { color: t('fg-4') }]}> · still filling</Text>
                    ) : null}
                  </Text>
                  {note ? <Chevron open={noteOpen} /> : null}
                </View>
                <Text style={[styles.when, { color: t('fg-4') }]}>{relTime(e.ts)}</Text>
              </Pressable>
              {note && noteOpen ? <AdvisoryNote note={note} /> : null}
            </View>
          );
        })}
      </View>

      {orders.length > ACTIVITY_PREVIEW ? (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          accessibilityRole="button"
          style={[styles.more, { borderTopColor: t('border') }]}
        >
          <Text style={[styles.moreLabel, { color: t('fg-4') }]}>
            {showMoreLabel(orders.length, showAll)}
          </Text>
        </Pressable>
      ) : null}

      <Text style={[styles.footer, { color: t('fg-4') }]}>~$ = at today's price · practice account</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 12 },
  divider: { borderBottomWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 1, minWidth: 0 },
  title: { fontFamily: fonts.sans(400), fontSize: 12.5, flexShrink: 1 },
  value: { fontFamily: fonts.mono(400), fontSize: 11, ...MONO_FEATURES },
  filling: { fontFamily: fonts.sans(400), fontSize: 11 },
  when: { fontFamily: fonts.mono(400), fontSize: 10.5 },
  chevron: { marginLeft: 6 },
  note: { paddingBottom: 8, paddingLeft: 10, rowGap: 3 },
  noteHead: { fontFamily: fonts.mono(400), fontSize: 11 },
  rationale: { fontFamily: fonts.sans(400), fontSize: 12, lineHeight: 18 },
  wouldApply: { fontFamily: fonts.mono(400), fontSize: 10.5, ...MONO_FEATURES },
  meta: { fontFamily: fonts.mono(400), fontSize: 10 },
  more: { borderTopWidth: 1, paddingTop: 8, width: '100%', alignItems: 'center' },
  moreLabel: { fontFamily: fonts.mono(400), fontSize: 10.5 },
  footer: { fontFamily: fonts.mono(400), fontSize: 10, marginTop: 6 },
});
