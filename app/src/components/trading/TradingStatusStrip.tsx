// Plain-language health strip for the trading agent — one quiet line when
// healthy. No raw field names ever reach the screen: tick age reads as "last
// check: 3m ago", the gate counter appears only when nonzero and in words,
// and a halt is a red sentence, not a code.
//
// Port of apps/hub/src/components/trading/TradingStatusStrip.tsx. The Resume
// button is the ONE write on this surface (mode changes and start/stop stay a
// terminal ritual, docs/inventory/trading.md §6) and it goes through the real
// gate: api.resumeTrading() POSTs /action/challenge and then throws
// GateNotWiredError until Task 21 lands the Secure Enclave signer. Nothing here
// fakes a success — the thrown error is rendered like any other failure.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TradingBudget, TradingStatus } from '../../lib/types';
import { api, ApplyError, GateNotWiredError } from '../../lib/api';
import { relTime } from '../../shared/time';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { gatedStreakLine, statusStripView } from './tradingFormat';

/** TradingStatusStrip.tsx:22-27. A cancelled gate says nothing at all. */
export function writeErrorMessage(err: unknown): string | null {
  if (err instanceof ApplyError || err instanceof GateNotWiredError) {
    return err.code === 'cancelled' ? null : err.message;
  }
  return err instanceof Error ? err.message : 'Resume failed.';
}

export interface TradingStatusStripProps {
  trading: TradingStatus | null | undefined;
  budget?: TradingBudget | null;
}

export function TradingStatusStrip({ trading, budget }: TradingStatusStripProps) {
  const { t } = useTheme();
  const [resuming, setResuming] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  if (!trading) return null;

  async function resume() {
    setResuming(true);
    setResumeError(null);
    try {
      await api.resumeTrading();
      setResumed(true);
    } catch (err) {
      const msg = writeErrorMessage(err);
      if (msg) setResumeError(msg);
    } finally {
      setResuming(false);
    }
  }

  if (trading.status === 'offline') {
    return (
      <View style={styles.offline}>
        <View style={[styles.dot, { backgroundColor: t('fg-4') }]} />
        <Text style={[styles.mono, { color: t('fg-4') }]}>trading agent · offline</Text>
      </View>
    );
  }

  const v = statusStripView(trading, budget);

  return (
    <View style={styles.strip}>
      <View style={styles.headRow}>
        <Text
          style={[
            styles.badge,
            { backgroundColor: t(v.tone.soft), borderColor: t(v.tone.border), color: t(v.tone.color) },
          ]}
        >
          {v.badge}
        </Text>
        <View style={[styles.dot, { backgroundColor: t(v.dot) }]} />
        <Text style={[styles.mono, { color: t(v.statusColor) }]}>{v.statusText}</Text>
        {v.tradesLabel ? (
          <Text style={[styles.mono, { color: t('fg-4') }]}>· {v.tradesLabel}</Text>
        ) : null}
        {v.secondStrategy ? (
          <Text style={[styles.mono, { color: t('fg-4') }]}>· {v.secondStrategy}</Text>
        ) : null}
      </View>

      {trading.halted ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.halt,
            { backgroundColor: t('status-down-soft'), borderColor: t('status-down-border-strong') },
          ]}
        >
          <Text style={[styles.haltTitle, { color: t('status-down') }]}>
            Trading is paused — {trading.halted}. It won't trade again until resumed.
          </Text>
          {trading.halted_since ? (
            <Text style={[styles.haltSince, { color: t('status-down') }]}>
              paused since {relTime(trading.halted_since)}
            </Text>
          ) : null}
          {resumed ? (
            // Local state only, exactly as the PWA: nothing invalidates
            // ['trading'], so the banner itself stays until the next 60s poll
            // returns halted: null (docs/inventory/trading.md OQ-20).
            <Text style={[styles.resumedNote, { color: t('fg-2') }]}>
              Resumed — this clears at the next check, and the first day back trades at half size.
            </Text>
          ) : (
            <>
              <Pressable
                onPress={resume}
                disabled={resuming}
                accessibilityRole="button"
                accessibilityState={{ disabled: resuming }}
                style={({ pressed }) => [
                  styles.resume,
                  {
                    backgroundColor: t('accent-soft'),
                    borderColor: t('accent-border'),
                    opacity: resuming ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.resumeLabel, { color: t('accent') }]}>
                  {resuming ? 'Resuming…' : 'Resume trading'}
                </Text>
              </Pressable>
              {resumeError ? (
                <Text style={[styles.resumeError, { color: t('status-down') }]}>{resumeError}</Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {v.gated > 0 ? (
        <View
          style={[
            styles.gated,
            { backgroundColor: t('status-warn-soft'), borderColor: t('status-warn-border') },
          ]}
        >
          <Text style={[styles.gatedText, { color: t('status-warn') }]}>
            {gatedStreakLine(v.gated)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { marginBottom: 12 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 9,
    paddingHorizontal: 2,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  mono: { fontFamily: fonts.mono(400), fontSize: 11 },
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
  halt: { marginTop: 9, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  haltTitle: { fontFamily: fonts.sans(600), fontSize: 13.5, lineHeight: 19.575 },
  haltSince: { fontFamily: fonts.mono(400), fontSize: 10.5, marginTop: 3, opacity: 0.85 },
  resumedNote: { fontFamily: fonts.sans(400), fontSize: 12, marginTop: 8 },
  resume: {
    width: '100%',
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeLabel: { fontFamily: fonts.sans(600), fontSize: 13.5 },
  resumeError: { fontFamily: fonts.sans(400), fontSize: 11.5, marginTop: 5 },
  gated: { marginTop: 9, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  gatedText: { fontFamily: fonts.sans(400), fontSize: 12.5, lineHeight: 18.125 },
});
