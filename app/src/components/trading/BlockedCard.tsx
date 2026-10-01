// What it tried and couldn't do. Spindle's /events deliberately drops gate
// denials as high-volume noise — correct for a raw feed, and the reason a
// stalled sleeve went unnoticed for two days in August 2026. The answer is to
// summarise them, not to dump 1,336 rows: budget denials are counted elsewhere,
// halts have their own banner, and what remains is a short tail that matters.
//
// The tripwire is the point of the card. It names each day's reason separately
// because DBC was stopped by unsettled cash on one day and a stale price feed on
// the next; calling that "blocked 2 days running" would send you after the wrong
// fix.
//
// Port of apps/hub/src/components/trading/BlockedCard.tsx. The PWA's native
// <details>/<summary> becomes a Pressable carrying the same expanded state; the
// "▾" in the summary is part of the label there too and does not flip.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TradingLog } from '../../lib/types';
import { symName } from '../../shared/symbols';
import { relTime } from '../../shared/time';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { Card } from '../shell';
import {
  blockedRowLine,
  blockedSummary,
  blockedView,
  settledLine,
  tripwireLine,
  usd0,
} from './tradingFormat';

export function BlockedCard({ log }: { log: TradingLog | null | undefined }) {
  const { t } = useTheme();
  const [showBlocked, setShowBlocked] = useState(false);

  if (!log) {
    return (
      <Text style={[styles.loose, { color: t('fg-4') }]}>
        the blocked-order history isn’t available right now — it comes back on its own
      </Text>
    );
  }

  const view = blockedView(log);
  const newestFirst = view.blocked.slice().reverse();

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: t('fg-4') }]}>Blocked · what it tried and couldn’t do</Text>

      {/* During a halt the breaker short-circuits every other check, so nothing
          downstream is ever recorded. Claiming "nothing blocked" here would go
          blind exactly when it matters most. */}
      {view.halted ? (
        <Text style={[styles.body, { color: t('status-warn') }]}>
          It’s paused, so nothing got as far as being checked — anything behind the pause won’t show
          until it resumes.
        </Text>
      ) : view.blocked.length === 0 ? (
        <Text style={[styles.body, { color: t('fg-2') }]}>
          Nothing blocked this week — every order it wanted went through.
        </Text>
      ) : view.tripwires.length === 0 ? (
        /* Everything blocked this week has since gone through. This is history,
           not a problem, and it must not read like one: the verdict leads and the
           detail is demoted. */
        <>
          <Text style={[styles.verdict, { color: t('fg-1') }]}>Nothing outstanding.</Text>
          <Text style={[styles.body, styles.verdictDetail, { color: t('fg-2') }]}>
            {blockedSummary(view)}
          </Text>
          <Pressable
            onPress={() => setShowBlocked((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showBlocked }}
            style={styles.summary}
          >
            <Text style={[styles.mono105, { color: t('fg-4') }]}>what was blocked ▾</Text>
          </Pressable>
          {showBlocked ? (
            <View style={styles.blockedList}>
              {newestFirst.map((b, i) => (
                <Text
                  key={`${b.ts}-${b.symbol}-${i}`}
                  style={[styles.mono11, { color: t('fg-3') }]}
                >
                  {blockedRowLine(b)}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <>
          {view.tripwires.map(([symbol, v]) => (
            <View
              key={symbol}
              accessibilityRole="alert"
              style={[
                styles.tripwire,
                {
                  backgroundColor: t('status-down-soft'),
                  borderColor: t('status-down-border-strong'),
                },
              ]}
            >
              <Text style={[styles.body, { color: t('status-down') }]}>{tripwireLine(symbol, v)}</Text>
            </View>
          ))}

          <View style={styles.rows}>
            {newestFirst.map((b, i) => (
              <View key={`${b.ts}-${b.symbol}-${i}`}>
                <Text style={[styles.rowTitle, { color: t('fg-1') }]}>
                  Couldn’t {b.side === 'sell' ? 'sell' : 'buy'} {symName(b.symbol ?? '')}
                  {b.value_display != null ? (
                    <Text style={{ color: t('fg-3') }}> (~{usd0(b.value_display)})</Text>
                  ) : null}
                </Text>
                <Text style={[styles.mono105, { color: t('fg-3') }]}>
                  {b.reason_plain} · {relTime(b.ts)}
                </Text>
              </View>
            ))}
          </View>

          {/* "an order went in", never "filled": spindle's receipts stop at
              pending_new and no fill is ever journaled, so claiming execution
              would assert something the data cannot support. */}
          {view.settled.length > 0 ? (
            <Text style={[styles.mono105, styles.settled, { color: t('fg-4') }]}>
              {settledLine(view.settled)}
            </Text>
          ) : null}

          <Text style={[styles.mono10, styles.footer, { color: t('fg-4') }]}>
            it decides once a day, so a blocked order isn’t retried until the next one
          </Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  // The PWA's own mt-[12px] (BlockedCard.tsx:33), on TOP of the route's
  // wrapper margin — the unavailable line sits 24px down, not 12.
  loose: { fontFamily: fonts.mono(400), fontSize: 10.5, paddingHorizontal: 2, marginTop: 12 },
  eyebrow: {
    fontFamily: fonts.mono(400),
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  body: { fontFamily: fonts.sans(400), fontSize: 12.5, lineHeight: 18.125 },
  verdict: { fontFamily: fonts.sans(550), fontSize: 13, lineHeight: 18.85 },
  verdictDetail: { marginTop: 2 },
  summary: { marginTop: 9, alignSelf: 'flex-start' },
  blockedList: { marginTop: 7, rowGap: 5, opacity: 0.75 },
  mono11: { fontFamily: fonts.mono(400), fontSize: 11 },
  mono105: { fontFamily: fonts.mono(400), fontSize: 10.5 },
  mono10: { fontFamily: fonts.mono(400), fontSize: 10 },
  tripwire: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 9,
  },
  rows: { rowGap: 7 },
  rowTitle: { fontFamily: fonts.sans(400), fontSize: 13 },
  settled: { marginTop: 9 },
  footer: { marginTop: 8 },
});
