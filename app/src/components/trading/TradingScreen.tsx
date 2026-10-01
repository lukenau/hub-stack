// The spindle trading agent's own surface, split out of Money on 2026-08-08:
// the paper book is not personal spend, and the agent had outgrown a section.
// Glance at the top — is it healthy, is the book where it wants to be — with
// the depth below. Read-only by design; starting and stopping stay a terminal
// ritual, never a tap. (The one write is the halt banner's Resume, which the
// status strip owns.)
//
// 1:1 port of apps/hub/src/routes/Trading.tsx — same eight queries, same
// order, same mount conditions (docs/inventory/trading.md §3).
import { StyleSheet, Text, View } from 'react-native';
import { PageTitle, RefreshControl, Screen, ScreenLabel, SkeletonCard } from '../shell';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { api } from '../../lib/api';
import { QUERY_TUNING, usePoll } from '../../lib/query';
import { EquityChart } from '../charts/EquityChart';
import { BlockedCard } from './BlockedCard';
import { DecisionsCard } from './DecisionsCard';
import { ExposureCard } from './ExposureCard';
import { GuardrailsStrip } from './GuardrailsStrip';
import { PositionsCard } from './PositionsCard';
import { ProposalLedger } from './ProposalLedger';
import { SessionLog } from './SessionLog';
import { TargetVsActual } from './TargetVsActual';
import { TradingActivity } from './TradingActivity';
import { TradingStatusStrip } from './TradingStatusStrip';

export default function TradingScreen() {
  const { t } = useTheme();
  const trading = usePoll(['trading'], api.trading, QUERY_TUNING.trading);
  const perf = usePoll(['trading-perf'], api.tradingPerf, QUERY_TUNING['trading-perf']);
  const explain = usePoll(['trading-explain'], api.tradingExplain, QUERY_TUNING['trading-explain']);
  const events = usePoll(['trading-events'], api.tradingEvents, QUERY_TUNING['trading-events']);
  // Shared cache key with Home and Money. Kept even though the "Waiting on you"
  // block below is not portable yet: it is one of the eight queries the refresh
  // control reports the age of, and dropping it would change that stamp.
  const decisions = usePoll(['decisions'], api.decisions, QUERY_TUNING['decisions-shared']);
  const exposure = usePoll(['trading-exposure'], api.tradingExposure, QUERY_TUNING['trading-exposure']);
  const log = usePoll(['trading-log'], api.tradingLog, QUERY_TUNING['trading-log']);
  const proposals = usePoll(
    ['trading-proposals'],
    api.tradingProposals,
    QUERY_TUNING['trading-proposals'],
  );

  return (
    <Screen
      header={
        <PageTitle
          right={
            <RefreshControl
              queries={[trading, perf, explain, events, decisions, exposure, log, proposals]}
            />
          }
        >
          Trading
        </PageTitle>
      }
    >
      <TradingStatusStrip trading={trading.data} budget={log.data?.budget} />

      <GuardrailsStrip budget={log.data?.budget} />

      {perf.isLoading && !perf.data ? (
        <SkeletonCard height={220} />
      ) : perf.data ? (
        <EquityChart perf={perf.data} trading={trading.data} />
      ) : null}

      {perf.data ? (
        <View style={styles.gap}>
          <TargetVsActual perf={perf.data} explain={explain.data} />
        </View>
      ) : null}

      {/* Mounted as soon as the log query RESOLVES, null data included — that
          null is what renders the "isn't available right now" line. */}
      {!log.isLoading ? (
        <View style={styles.gap}>
          <BlockedCard log={log.data} />
        </View>
      ) : null}

      {perf.data ? (
        <View style={styles.gap}>
          <PositionsCard perf={perf.data} explain={explain.data} />
        </View>
      ) : null}

      {log.data?.sessions && log.data.sessions.length > 0 ? (
        <View style={styles.gap}>
          <SessionLog sessions={log.data.sessions} perf={perf.data} />
        </View>
      ) : null}

      {log.data?.decisions && log.data.decisions.length > 0 ? (
        <View style={styles.gap}>
          <DecisionsCard decisions={log.data.decisions} />
        </View>
      ) : null}

      {/* FOLLOW-UP (Task 10 owns src/components/decisions/DecisionCards.tsx,
          which does not exist yet). Trading.tsx:96-101 renders, between the
          daily-decisions card and the activity feed:

            const tradingDecisions = (decisions.data?.open ?? []).filter((d) => d.domain === 'trading');
            const { applying, toast, clearToast, answer } = useDecisionAnswers();
            …
            {tradingDecisions.length > 0 && (
              <>
                <ScreenLabel>Waiting on you · trading decisions</ScreenLabel>
                <DecisionGroups decisions={tradingDecisions} applying={applying} onAnswer={answer} />
              </>
            )}
            …
            {toast && <Toast kind={toast.kind} text={toast.text} onDone={clearToast} />}

          The Toast is a sibling of <Screen>, per the shell contract — so wiring
          this is not a three-line edit: it is the import, the two consts, the
          five-line JSX block, the Toast, AND wrapping the whole return in a
          fragment so the Toast can sit beside <Screen> (~10 lines plus a
          re-indent of the body). */}

      {events.data && events.data.length > 0 ? (
        <>
          <ScreenLabel>Trading activity · recent orders</ScreenLabel>
          <TradingActivity events={events.data} perf={perf.data} advisory={log.data?.advisory} />
        </>
      ) : null}

      {exposure.data ? (
        <>
          <ScreenLabel>Paper book · what the ETFs hold</ScreenLabel>
          <ExposureCard exposure={exposure.data} />
        </>
      ) : !exposure.isLoading && perf.data ? (
        <Text style={[styles.unavailable, { color: t('fg-4') }]}>
          the ETF look-through isn't available right now — it comes back on its own
        </Text>
      ) : null}

      <ScreenLabel>Self-improvement · proposals from the weekly review</ScreenLabel>
      <ProposalLedger data={proposals.data} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 12 },
  unavailable: { fontFamily: fonts.mono(400), fontSize: 10.5, marginTop: 12, paddingHorizontal: 2 },
});
