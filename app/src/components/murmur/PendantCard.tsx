// 1:1 port of apps/hub/src/components/murmur/PendantCard.tsx.
//
// The gated actions (drain / pause / resume) go through api.applyWrite, the
// same challenge -> assertion -> apply ceremony every other write in this app
// uses. The native assertion step is not wired yet (Task 21) — until then
// api.applyWrite rejects with GateNotWiredError, and writeErrorMessage below
// surfaces its message exactly the way the PWA surfaces a WebAuthnError,
// silent only for a `cancelled` code.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, ApplyError, GateNotWiredError } from '../../lib/api';
import { StatePanel } from '../shell/StatePanel';
import { SectionHead } from '../shell/SectionHead';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import type { TokenName } from '../../theme/tokens.gen';
import { relTime } from '../../shared/time';
import type { MurmurStatus } from '../../lib/types';

/** Inline message for a failed write; null = silent (gate cancelled). */
export function writeErrorMessage(err: unknown): string | null {
  if (err instanceof ApplyError || err instanceof GateNotWiredError) {
    return err.code === 'cancelled' ? null : err.message;
  }
  return err instanceof Error ? err.message : 'Write failed.';
}

type PendantState = MurmurStatus['pendant']['state'];

export function stateLabel(state: PendantState): string {
  if (state === 'recording') return 'Recording';
  if (state === 'paused') return 'Paused';
  if (state === 'disconnected') return 'Disconnected';
  return 'Never bonded';
}

export function stateColor(state: PendantState): TokenName {
  if (state === 'recording') return 'status-up';
  if (state === 'paused') return 'status-warn';
  return 'status-down';
}

type ActionKind = 'drain' | 'pause' | 'resume';

export interface PendantCardProps {
  data: MurmurStatus;
  onApplied: () => Promise<unknown>;
}

export function PendantCard({ data, onApplied }: PendantCardProps) {
  const { t } = useTheme();
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const { pendant, bridge } = data;

  async function act(kind: ActionKind) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setApplied(null);
    try {
      const action =
        kind === 'drain' ? 'murmur.drain_now' : kind === 'pause' ? 'murmur.capture_pause' : 'murmur.capture_resume';
      await api.applyWrite({ action });
      setApplied('Queued — the bridge picks it up within ~60s.');
      await onApplied();
    } catch (err) {
      const msg = writeErrorMessage(err);
      if (msg) setError(msg);
    } finally {
      setBusy(null);
    }
  }

  if (pendant.state === 'never_seen') {
    return (
      <View style={styles.section}>
        <SectionHead label="Pendant" />
        <StatePanel
          tone="neutral"
          title="No pendant bonded yet."
          detail="The bridge is waiting for its first pairing."
        />
      </View>
    );
  }

  const gaugePct =
    pendant.flash_used_pages != null && pendant.flash_total_pages
      ? Math.min(100, Math.round((pendant.flash_used_pages / pendant.flash_total_pages) * 100))
      : null;

  const disabledReason = !bridge.up ? 'Bridge is down — actions can’t reach the pendant right now.' : null;
  const controlsDisabled = busy !== null || disabledReason !== null;

  return (
    <View style={styles.section}>
      <SectionHead label="Pendant" />
      <View style={[styles.card, { backgroundColor: t('bg-1'), borderColor: t('border') }]}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: t(stateColor(pendant.state)) }]} />
          <Text style={[styles.stateText, { color: t('fg-0') }]}>{stateLabel(pendant.state)}</Text>
          {pendant.bond_owner ? (
            <Text style={[styles.bondText, { color: t('fg-4') }]}>· bonded to {pendant.bond_owner}</Text>
          ) : null}
        </View>
        {pendant.last_status_at ? (
          <Text style={[styles.lastHeard, { color: t('fg-3') }]}>
            last heard from {relTime(pendant.last_status_at)}
          </Text>
        ) : null}

        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: t('fg-3') }]}>Battery</Text>
          <Text style={[styles.metricValue, { color: t('fg-1') }]}>
            {pendant.battery_pct != null ? `${pendant.battery_pct}%` : '—'}
          </Text>
        </View>

        <View style={[styles.metricRow, styles.gaugeLabelRow]}>
          <Text style={[styles.metricLabel, { color: t('fg-3') }]}>Flash buffer</Text>
          <Text style={[styles.gaugeLabel, { color: t('fg-3') }]}>
            {gaugePct != null ? `${gaugePct}% used` : '—'}
          </Text>
        </View>
        <View
          accessibilityRole="image"
          accessibilityLabel={gaugePct != null ? `Flash buffer ${gaugePct}% used` : 'Flash buffer unknown'}
          style={[styles.gaugeTrack, { backgroundColor: t('bg-2') }]}
        >
          {gaugePct != null ? (
            <View
              style={[
                styles.gaugeFill,
                {
                  width: `${gaugePct}%`,
                  backgroundColor: gaugePct >= 90 ? t('status-warn') : t('fg-3'),
                },
              ]}
            />
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => act('drain')}
            disabled={controlsDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: controlsDisabled }}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: t('accent-soft'), borderColor: t('accent-border') },
              controlsDisabled && styles.buttonDisabled,
              pressed && !controlsDisabled && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.buttonTextAccent, { color: t('accent') }]}>
              {busy === 'drain' ? 'Draining…' : 'Drain now'}
            </Text>
          </Pressable>
          {pendant.state !== 'disconnected' ? (
            <Pressable
              onPress={() => act(pendant.state === 'recording' ? 'pause' : 'resume')}
              disabled={controlsDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: controlsDisabled }}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: t('bg-2'), borderColor: t('border-strong') },
                controlsDisabled && styles.buttonDisabled,
                pressed && !controlsDisabled && styles.buttonPressed,
              ]}
            >
              <Text style={[styles.buttonTextSecondary, { color: t('fg-1') }]}>
                {busy === 'pause' || busy === 'resume'
                  ? 'Applying…'
                  : pendant.state === 'recording'
                    ? 'Pause capture'
                    : 'Resume capture'}
              </Text>
            </Pressable>
          ) : null}
          {disabledReason ? <Text style={[styles.hint, { color: t('fg-4') }]}>{disabledReason}</Text> : null}
          {applied && !error ? <Text style={[styles.applied, { color: t('status-up') }]}>{applied}</Text> : null}
          {error ? <Text style={[styles.error, { color: t('status-down') }]}>{error}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  card: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  stateText: { fontFamily: fonts.sans(560), fontSize: 15 },
  bondText: { fontFamily: fonts.mono(400), fontSize: 10.5 },
  lastHeard: { fontFamily: fonts.mono(400), fontSize: 10.5, marginTop: 2 },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 6,
  },
  gaugeLabelRow: { marginTop: 0, marginBottom: 5 },
  metricLabel: { fontFamily: fonts.sans(400), fontSize: 12 },
  metricValue: { fontFamily: fonts.mono(400), fontSize: 13, ...MONO_FEATURES },
  gaugeLabel: { fontFamily: fonts.mono(400), fontSize: 11, ...MONO_FEATURES },
  gaugeTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 3 },
  actions: { gap: 8, marginTop: 16 },
  button: { width: '100%', minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.7 },
  buttonTextAccent: { fontFamily: fonts.sans(600), fontSize: 14 },
  buttonTextSecondary: { fontFamily: fonts.sans(550), fontSize: 14 },
  hint: { fontFamily: fonts.sans(400), fontSize: 11.5, textAlign: 'center' },
  applied: { fontFamily: fonts.mono(400), fontSize: 11, textAlign: 'center' },
  error: { fontFamily: fonts.sans(400), fontSize: 12, textAlign: 'center' },
});
