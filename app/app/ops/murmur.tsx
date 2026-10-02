// 1:1 port of apps/hub/src/routes/Murmur.tsx.
//
// Murmur — the always-on pendant capture pipeline. The capture chain strip
// carries the page; the four cards below are quiet, read-only detail for
// whichever stage someone wants to check on. Chronicle (transcription +
// diarization backend) lives on its own tailnet port; this page links out to
// it rather than reimplementing its UI.
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  PageTitle,
  RefreshControl,
  Screen,
  SectionHead,
  StatePanel,
  useHideTabBar,
} from '../../src/components/shell';
import { CaptureChain } from '../../src/components/murmur/CaptureChain';
import { PendantCard } from '../../src/components/murmur/PendantCard';
import { api } from '../../src/lib/api';
import { usePoll, QUERY_TUNING } from '../../src/lib/query';
import { relTime } from '../../src/shared/time';
import { fonts, MONO_FEATURES } from '../../src/theme/fonts';
import { useTheme } from '../../src/theme/useTheme';
import type { MurmurStatus } from '../../src/lib/types';

/** Page-local card idiom: radius 14, 16/14 padding — distinct from the shell
 * Card's 16/18-14 (the same duplication the PWA carries between Murmur and Ops). */
function Card({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  return <View style={[styles.card, { backgroundColor: t('bg-1'), borderColor: t('border') }]}>{children}</View>;
}

function Row({ label, value, tone, mono }: { label: string; value: string; tone?: string; mono?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: t('fg-3') }]}>{label}</Text>
      <Text
        style={[mono ? styles.rowValueMono : styles.rowValue, { color: tone ?? t('fg-1') }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {value}
      </Text>
    </View>
  );
}

function humanizeBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function BridgeCard({ data }: { data: MurmurStatus }) {
  const { t } = useTheme();
  const { bridge } = data;
  return (
    <View style={styles.section}>
      <SectionHead label="Bridge" />
      <Card>
        <Row label="Host" value={bridge.host ?? '—'} mono />
        <Row label="Status" value={bridge.up ? 'up' : 'down'} tone={bridge.up ? t('status-up') : t('status-down')} />
        <Row label="Heartbeat" value={bridge.last_heartbeat_at ? relTime(bridge.last_heartbeat_at) : '—'} />
        <Row
          label="Queue"
          value={bridge.queue_wavs != null ? `${bridge.queue_wavs} wav${bridge.queue_wavs === 1 ? '' : 's'}` : '—'}
        />
        <Row label="Last upload" value={bridge.last_upload_at ? relTime(bridge.last_upload_at) : '—'} />
        {bridge.last_error ? (
          <Text style={[styles.errorBlock, { color: t('status-down'), borderTopColor: t('border') }]}>
            {bridge.last_error}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

function PipelineCard({ data }: { data: MurmurStatus }) {
  const { t } = useTheme();
  const { pipeline } = data;
  // The Chronicle dashboard is optional and self-hosted, so its address has to
  // come from the server (murmur.json) rather than ship as a constant — a
  // placeholder host is a dead link a stranger cannot fix without editing code.
  const chronicleUrl = data.chronicle_url?.trim() || null;
  return (
    <View style={styles.section}>
      <SectionHead label="Pipeline" />
      <Card>
        <Row
          label="Backend"
          value={pipeline.backend_up ? 'up' : 'down'}
          tone={pipeline.backend_up ? t('status-up') : t('status-down')}
        />
        {/* null is derive's "couldn't measure" (Chronicle login failed while
            /health still answers), NOT a measured zero — render it like
            humanizeBytes does, so an outage cannot read as a quiet day. */}
        <Row
          label="Conversations today"
          value={pipeline.conversations_today != null ? `${pipeline.conversations_today}` : '—'}
        />
        <Row
          label="End-to-end pace (incl. AI summarizing)"
          value={pipeline.marginal_rtf != null ? `${pipeline.marginal_rtf.toFixed(2)}× realtime` : '—'}
        />
        {pipeline.last_conversation_at ? (
          <Text style={[styles.subLine, { color: t('fg-4') }]}>
            last conversation {relTime(pipeline.last_conversation_at)}
          </Text>
        ) : null}
        {chronicleUrl ? (
          <Pressable
            onPress={() => {
              Linking.openURL(chronicleUrl).catch(() => {});
            }}
            accessibilityRole="link"
            style={({ pressed }) => [
              styles.linkRow,
              { borderTopColor: t('border') },
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.linkText, { color: t('fg-1') }]}>Open Chronicle</Text>
            <SymbolView name="arrow.up.right" size={16} tintColor={t('fg-3')} weight="regular" />
          </Pressable>
        ) : (
          <Text style={[styles.notConfigured, { borderTopColor: t('border'), color: t('fg-4') }]}>
            No Chronicle dashboard is configured on this server.
          </Text>
        )}
      </Card>
    </View>
  );
}

function MemoryCard({ data }: { data: MurmurStatus }) {
  const { memory } = data;
  return (
    <View style={styles.section}>
      <SectionHead label="Memory" />
      <Card>
        <Row label="Last sync" value={memory.etl_last_run_at ? relTime(memory.etl_last_run_at) : '—'} />
        <Row label="Memories today" value={memory.etl_docs_today != null ? `${memory.etl_docs_today}` : '—'} />
        <Row label="Day file" value={humanizeBytes(memory.canonical_day_bytes)} />
      </Card>
    </View>
  );
}

export default function MurmurScreen() {
  // Pushed detail route: the tab bar drops while this screen is focused.
  useHideTabBar();
  const q = usePoll(['murmur'], api.murmur, QUERY_TUNING.murmur);
  // Reachable by deep link even with no nav card, so the route gates itself
  // too: a stranger without a configured bridge gets bounced to Ops rather
  // than seeing the page at all (same "absent unless configured" rule as the
  // nav card — see OpsScreen.tsx and api.murmurConfigured).
  const configuredQ = usePoll(['murmur-configured'], api.murmurConfigured, QUERY_TUNING['murmur-configured']);
  useEffect(() => {
    if (configuredQ.data === false) router.replace('/ops');
  }, [configuredQ.data]);
  if (configuredQ.data !== true) return null;

  return (
    <Screen header={<PageTitle right={<RefreshControl queries={q} />}>Murmur</PageTitle>}>
      {q.isLoading ? (
        <StatePanel
          tone="pending"
          title="Reading capture status…"
          detail="hub-api /murmur · derived from Chronicle + the bridge"
        />
      ) : null}
      {q.isError ? <StatePanel tone="error" title="Murmur unavailable" detail={q.error?.message ?? ''} /> : null}
      {!q.isLoading && !q.isError && q.data === null ? (
        <StatePanel
          tone="neutral"
          title="Murmur unavailable"
          detail="The derive cron hasn't reported in the last 15 minutes — capture may still be running, this page just can't see it."
        />
      ) : null}
      {q.data ? (
        <>
          <CaptureChain data={q.data} />
          <PendantCard data={q.data} onApplied={() => q.refetch()} />
          <BridgeCard data={q.data} />
          <PipelineCard data={q.data} />
          <MemoryCard data={q.data} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  card: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingVertical: 6 },
  rowLabel: { fontFamily: fonts.sans(400), fontSize: 12, flexShrink: 0 },
  rowValue: { fontFamily: fonts.sans(400), fontSize: 13, flex: 1, textAlign: 'right', ...MONO_FEATURES },
  rowValueMono: { fontFamily: fonts.mono(400), fontSize: 11.5, flex: 1, textAlign: 'right', ...MONO_FEATURES },
  errorBlock: {
    fontFamily: fonts.mono(400),
    fontSize: 11,
    lineHeight: 16.5,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  subLine: { fontFamily: fonts.mono(400), fontSize: 10.5, marginTop: 2 },
  notConfigured: {
    fontFamily: fonts.mono(400),
    fontSize: 10.5,
    lineHeight: 16.5,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    minHeight: 44,
    borderTopWidth: 1,
  },
  linkText: { fontFamily: fonts.sans(550), fontSize: 13.5 },
  buttonPressed: { opacity: 0.7 },
});
