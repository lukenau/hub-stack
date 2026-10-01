// The self-improvement agent's proposal ledger. Awaiting proposals get full
// cards (the setting in plain words, the change, why, the falsifiable
// expectation + confidence, what the proposal survived, and a link to its
// decision card). Killed proposals are never deleted — they collapse into a
// one-line-each list with cause of death. The scorecard row is a stub until
// proposals resolve and grading begins.
//
// Port of apps/hub/src/components/trading/ProposalLedger.tsx. The wouter
// <Link href="/decisions"> becomes a router.push of the same in-app path — the
// PWA's link is not deep-filtered to the proposal either (trading.md OQ-8).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { TradingProposals } from '../../lib/types';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { PRESSED_OPACITY } from '../shell';
import {
  expectationLine,
  killedHeader,
  proposalSubtitle,
  proposalTitle,
  resolvedLine,
} from './tradingFormat';

export function ProposalLedger({ data }: { data: TradingProposals | null | undefined }) {
  const { t } = useTheme();
  const [showKilled, setShowKilled] = useState(false);

  if (!data) {
    return (
      <Text style={[styles.loose, { color: t('fg-4') }]}>
        the proposal ledger hasn't been published yet — it appears after the first weekly review
      </Text>
    );
  }

  const awaiting = data.awaiting ?? [];
  const killed = data.killed ?? [];
  const resolved = data.resolved ?? [];

  return (
    <View style={styles.stack}>
      {awaiting.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: t('bg-1'), borderColor: t('border') }]}>
          <Text style={[styles.empty, { color: t('fg-3') }]}>
            Nothing is waiting on you — no proposal has survived testing yet.
          </Text>
        </View>
      ) : (
        awaiting.map((p) => {
          const subtitle = proposalSubtitle(p.param_plain);
          return (
            <View key={p.id} style={[styles.card, { backgroundColor: t('bg-1'), borderColor: t('border') }]}>
              <View style={styles.head}>
                {/* The PWA lets this wrap (min-w-0, no truncate): a clipped
                    setting name is content the reader loses. */}
                <Text style={[styles.title, { color: t('fg-1') }]}>
                  {proposalTitle(p.param_plain)}
                </Text>
                <Text style={[styles.change, { color: t('fg-1') }]}>{p.change_plain}</Text>
              </View>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: t('fg-3') }]}>{subtitle}</Text>
              ) : null}
              <Text style={[styles.reasoning, { color: t('fg-2') }]}>{p.reasoning}</Text>
              <Text style={[styles.expectation, { color: t('fg-3') }]}>{expectationLine(p)}</Text>
              {p.survived.length > 0 ? (
                <Text style={[styles.survived, { color: t('inflow') }]}>
                  survived: {p.survived.join(', ')}
                </Text>
              ) : null}
              <Pressable
                onPress={() => router.push('/decisions')}
                accessibilityRole="link"
                style={({ pressed }) => [
                  styles.link,
                  { borderTopColor: t('border') },
                  pressed && { opacity: PRESSED_OPACITY },
                ]}
              >
                <Text style={[styles.linkText, { color: t('fg-4') }]}>
                  {p.decision_id
                    ? 'answer it on the Decisions page →'
                    : 'its decision card is on its way →'}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}

      {killed.length > 0 ? (
        <View style={[styles.killed, { borderColor: t('border') }]}>
          <Pressable
            onPress={() => setShowKilled((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showKilled }}
            style={styles.killedToggle}
          >
            <Text style={[styles.killedLabel, { color: t('fg-4') }]}>
              {killedHeader(killed.length, showKilled)}
            </Text>
          </Pressable>
          {showKilled ? (
            <View style={styles.killedRows}>
              {killed.map((k) => (
                <Text key={k.id} style={[styles.killedRow, { color: t('fg-3') }]}>
                  <Text style={{ color: t('fg-2') }}>{proposalTitle(k.param_plain)}</Text>
                  {' · '}
                  {k.cause}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {resolved.length > 0 ? (
        <Text style={[styles.resolved, { color: t('fg-4') }]}>{resolvedLine(resolved.length)}</Text>
      ) : null}

      <View style={[styles.scorecard, { borderColor: t('border-strong') }]}>
        <Text style={[styles.scorecardText, { color: t('fg-4') }]}>
          Scorecard — grading begins when proposals resolve
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The PWA's own mt-[12px] on the unavailable line (ProposalLedger.tsx:21).
  loose: { fontFamily: fonts.mono(400), fontSize: 10.5, paddingHorizontal: 2, marginTop: 12 },
  stack: { rowGap: 10 },
  emptyCard: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  empty: { fontFamily: fonts.sans(400), fontSize: 12 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  title: { fontFamily: fonts.sans(500), fontSize: 13, flexShrink: 1 },
  change: { fontFamily: fonts.mono(400), fontSize: 12, ...MONO_FEATURES },
  subtitle: { fontFamily: fonts.sans(400), fontSize: 11.5, marginTop: 2 },
  reasoning: { fontFamily: fonts.sans(400), fontSize: 12, marginTop: 8 },
  expectation: { fontFamily: fonts.mono(400), fontSize: 10.5, marginTop: 8 },
  survived: { fontFamily: fonts.mono(400), fontSize: 10.5, marginTop: 3 },
  link: { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  linkText: { fontFamily: fonts.mono(400), fontSize: 10.5, textAlign: 'right' },
  killed: { borderRadius: 12, borderWidth: 1 },
  killedToggle: { paddingHorizontal: 14, paddingVertical: 9 },
  killedLabel: { fontFamily: fonts.mono(400), fontSize: 10.5 },
  killedRows: { paddingHorizontal: 14, paddingBottom: 10, rowGap: 6 },
  killedRow: { fontFamily: fonts.sans(400), fontSize: 11.5 },
  resolved: { fontFamily: fonts.mono(400), fontSize: 10.5, paddingHorizontal: 2 },
  scorecard: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  scorecardText: { fontFamily: fonts.mono(400), fontSize: 10.5 },
});
