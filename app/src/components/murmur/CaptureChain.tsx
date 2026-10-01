// 1:1 port of apps/hub/src/components/murmur/CaptureChain.tsx.
//
// The signature element of /ops/murmur: Pendant -> Bridge -> Pipeline -> Memory
// as one horizontal strip. Each stage gets exactly one status dot (up/warn/down —
// never the accent, which is reserved for actions) and one compact fact line, so
// a broken link in the chain reads as the one dim/red stage among three healthy
// ones, not as a wall of text to parse.
//
// The stage/derivation functions are exported (the PWA keeps them module-private)
// so the chain-state mapper can be unit tested directly — see CaptureChain.test.ts.
import { StyleSheet, Text, View } from 'react-native';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import type { TokenName } from '../../theme/tokens.gen';
import { dateLabel, relTime, toMs } from '../../shared/time';
import type { MurmurStatus } from '../../lib/types';

// ~35h VAD-gated onboard flash buffer, per docs/superpowers/specs/2026-09-01-murmur-design.md
// ("Pendant (frozen firmware; Opus 16k mono; ~35h VAD-gated flash)") — flash_used/flash_total
// is the only signal we have for how much of that buffer is unsynced, so the estimate scales
// linearly off the documented capacity. Approximate by construction — rendered with a "~" prefix.
export const PENDANT_FLASH_HOURS = 35;

// The ETL cron runs hourly; three missed runs is a real signal, not jitter.
export const ETL_STALE_MS = 3 * 60 * 60 * 1000;

export type Tone = 'up' | 'warn' | 'down';

const TONE_TOKEN: Record<Tone, TokenName> = {
  up: 'status-up',
  warn: 'status-warn',
  down: 'status-down',
};

function Dot({ tone }: { tone: Tone }) {
  const { t } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.dot, { backgroundColor: t(TONE_TOKEN[tone]) }]}
    />
  );
}

function Stage({ tone, name, line }: { tone: Tone; name: string; line: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.stage}>
      <View style={styles.stageHead}>
        <Dot tone={tone} />
        <Text style={[styles.stageName, { color: t('fg-3') }]} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text style={[styles.stageLine, { color: t('fg-1') }]} numberOfLines={1} ellipsizeMode="tail">
        {line}
      </Text>
    </View>
  );
}

export function pendantStage(d: MurmurStatus): { tone: Tone; line: string } {
  const { pendant } = d;
  if (pendant.state === 'never_seen') return { tone: 'down', line: 'never bonded' };
  const battery = pendant.battery_pct != null ? `${pendant.battery_pct}%` : 'battery —';
  const hours =
    pendant.flash_used_pages != null && pendant.flash_total_pages
      ? `~${((pendant.flash_used_pages / pendant.flash_total_pages) * PENDANT_FLASH_HOURS).toFixed(1)}h buffered`
      : 'buffer —';
  const tone: Tone = pendant.state === 'recording' ? 'up' : pendant.state === 'paused' ? 'warn' : 'down';
  return { tone, line: `${battery} · ${hours}` };
}

export function bridgeStage(d: MurmurStatus): { tone: Tone; line: string } {
  const { bridge } = d;
  if (!bridge.up) return { tone: 'down', line: bridge.host ? 'unreachable' : 'no bridge' };
  const seen = bridge.last_heartbeat_at ? relTime(bridge.last_heartbeat_at) : 'seen —';
  const queue = bridge.queue_wavs != null ? `${bridge.queue_wavs} queued` : 'queue —';
  return { tone: 'up', line: `${seen} · ${queue}` };
}

// derive emits null for "couldn't measure" and a number for "measured zero" —
// two states an operator must be able to tell apart. Rendering null as "0" made
// a Chronicle auth failure (backend /health up, every authenticated metric null)
// pixel-identical to a quiet day.
export function pipelineStage(d: MurmurStatus): { tone: Tone; line: string } {
  const { pipeline } = d;
  if (!pipeline.backend_up) return { tone: 'down', line: 'backend down' };
  if (pipeline.conversations_today == null) return { tone: 'warn', line: 'backend up · metrics unreadable' };
  const age = pipeline.last_conversation_at ? relTime(pipeline.last_conversation_at) : 'none yet';
  return { tone: 'up', line: `${pipeline.conversations_today} today · ${age}` };
}

export function memoryStage(d: MurmurStatus, now = Date.now()): { tone: Tone; line: string } {
  const { memory } = d;
  if (!memory.etl_last_run_at) return { tone: 'down', line: 'no sync yet' };
  const synced = relTime(memory.etl_last_run_at, now);
  // etl_last_run_at is re-stamped on EVERY run whether or not anything synced,
  // so "non-null" is not health — only its age is.
  const lastRun = toMs(memory.etl_last_run_at);
  if (lastRun != null && now - lastRun > ETL_STALE_MS) {
    return { tone: 'warn', line: `stale · synced ${synced}` };
  }
  if (memory.etl_docs_today == null) return { tone: 'warn', line: `day file unreadable · synced ${synced}` };
  return { tone: 'up', line: `${memory.etl_docs_today} today · synced ${synced}` };
}

// Priority-ordered honest sentence: walks the chain from the pendant down and
// stops at the first real break, so the copy always names the actual cause
// rather than a generic "something's wrong".
export function chainSentence(d: MurmurStatus, now = Date.now()): string {
  const { pendant, bridge, pipeline } = d;
  if (pendant.state === 'never_seen') {
    return 'Nothing captured yet — no pendant bonded.';
  }
  if (pendant.state === 'paused') {
    return 'Capture is paused. Resume to keep everything in memory.';
  }
  // Out of BLE range is the DESIGNED-FOR case, not data loss: the pendant keeps
  // recording to its ~35h flash buffer and drains on reconnect. The old copy
  // asserted "nothing new is being captured" in exactly that window, and the
  // branch with the correct copy was unreachable (bridge.up === false always
  // implies state ∈ {never_seen, disconnected} in the derive contract).
  if (pendant.state === 'disconnected') {
    return bridge.up
      ? 'Pendant is out of range — still recording to its own flash; it drains when it reconnects.'
      : 'The bridge is down — the pendant should still be buffering to its own flash, but nothing is syncing.';
  }
  if (!bridge.up) {
    return 'Recording locally — the bridge is down, so nothing is syncing yet.';
  }
  if (!pipeline.backend_up) {
    return 'Bridge is up but the pipeline is down — audio is queued, not yet transcribed.';
  }
  if (!d.chain_last_complete_at) {
    return 'Capture is running; memory sync pending.';
  }
  // A bare time-of-day made a Friday-evening completion read identically on
  // Monday morning; carry the date once it is not today.
  const ms = toMs(d.chain_last_complete_at);
  if (ms == null) return 'Capture is running; memory sync pending.';
  const time = new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = new Date(ms).toDateString() === new Date(now).toDateString();
  return sameDay
    ? `Everything you said by ${time} is in memory.`
    : `Everything you said by ${time} on ${dateLabel(ms, now)} is in memory — nothing since.`;
}

export function CaptureChain({ data }: { data: MurmurStatus }) {
  const { t } = useTheme();
  const pendant = pendantStage(data);
  const bridge = bridgeStage(data);
  const pipeline = pipelineStage(data);
  const memory = memoryStage(data);

  return (
    <View style={[styles.container, { backgroundColor: t('bg-1'), borderColor: t('border') }]}>
      <View style={styles.row}>
        <Stage tone={pendant.tone} name="Pendant" line={pendant.line} />
        <Stage tone={bridge.tone} name="Bridge" line={bridge.line} />
        <Stage tone={pipeline.tone} name="Pipeline" line={pipeline.line} />
        <Stage tone={memory.tone} name="Memory" line={memory.line} />
      </View>
      <Text style={[styles.sentence, { color: t('fg-1'), borderTopColor: t('border') }]}>
        {chainSentence(data)}
      </Text>
    </View>
  );
}

// `tracking-[0.1em]` on a 10px mono name — distinct from SectionHead's 0.14em.
const STAGE_NAME_LETTER_SPACING = 10 * 0.1;

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stage: { flex: 1, minWidth: 0, gap: 5 },
  stageHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  stageName: {
    fontFamily: fonts.mono(400),
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: STAGE_NAME_LETTER_SPACING,
  },
  stageLine: {
    fontFamily: fonts.sans(400),
    fontSize: 12,
    lineHeight: 15.6,
    ...MONO_FEATURES,
  },
  sentence: {
    fontFamily: fonts.sans(550),
    fontSize: 13.5,
    lineHeight: 18.9,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
