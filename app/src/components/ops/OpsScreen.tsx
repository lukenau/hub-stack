// 1:1 port of apps/hub/src/routes/Ops.tsx.
//
// Ops — "what has Xavier been doing, does anything need me". Jump-offs first,
// then pending pairings (the only thing that blocks someone), session history,
// the Claude shells, cron jobs with gated run/pause, recent run output, a
// one-line board pulse, and jump-offs to Terminal / Files.
//
// Two approved deviations from the PWA (the user, 2026-09): Feed is no longer a
// tab, so the top jump-off card gains a Feed row above Agent spend; and
// Terminal moves up into that card, directly under Murmur (2026-09-22: "move
// the terminal entry point to the top of the ops page under murmur").
import { PageTitle, RefreshControl, Screen } from '../shell';
import { NavCard, type NavRow } from './NavCard';
import { NeedsYou } from './NeedsYou';
import { SessionsSection } from './SessionsSection';
import { ShellsSection } from './ShellsSection';
import { JobsSection } from './JobsSection';
import { RunsSection } from './RunsSection';
import { BackupsSection } from './BackupsSection';
import { BoardLine } from './BoardLine';
import { api } from '../../lib/api';
import { QUERY_TUNING, usePoll } from '../../lib/query';

/** Pure so the absent-unless-configured gate is unit-testable without
 * standing up the whole screen's query plumbing. `murmurConfigured` is
 * `undefined` while that read is in flight — treated the same as `false`
 * (fail closed to hidden, never a flash of a row that then disappears). */
export function opsNavRows(murmurConfigured: boolean | undefined): NavRow[] {
  return [
    { href: '/ops/feed', label: 'Feed', sub: 'briefs & cards from Xavier' },
    { href: '/ops/cost', label: 'Agent spend', sub: 'model + cron cost · windows & trends' },
    ...(murmurConfigured
      ? [{ href: '/ops/murmur' as const, label: 'Murmur', sub: 'pendant capture · bridge · Chronicle · memory' }]
      : []),
    { href: '/ops/terminal', label: 'Terminal', sub: 'tmux hub-term · Face ID gate' },
  ];
}

export function OpsScreen() {
  const pairing = usePoll(['pairing'], api.pairing, QUERY_TUNING['pairing-ops']);
  const sessions = usePoll(['sessions'], api.sessions, QUERY_TUNING['sessions-ops']);
  const cron = usePoll(['cron'], api.cron, QUERY_TUNING.cron);
  const cronLogs = usePoll(['cron-logs'], () => api.cronLogs(10), QUERY_TUNING['cron-logs-ops']);
  const kanban = usePoll(['kanban'], api.kanban, QUERY_TUNING.kanban);
  const shells = usePoll(['tmux-sessions'], api.tmuxSessions, QUERY_TUNING['tmux-sessions']);
  const backups = usePoll(['backups'], api.backups, QUERY_TUNING.backups);
  // Murmur requires a physical pendant + bridge most self-hosters don't have;
  // the nav row is absent until the server confirms a bridge is configured
  // (fails closed to hidden on error/loading — see api.murmurConfigured).
  const murmurConfigured = usePoll(['murmur-configured'], api.murmurConfigured, QUERY_TUNING['murmur-configured']);

  return (
    <Screen
      header={
        <PageTitle
          right={<RefreshControl queries={[pairing, sessions, cron, cronLogs, kanban, shells, backups]} />}
        >
          Ops
        </PageTitle>
      }
    >
      <NavCard rows={opsNavRows(murmurConfigured.data)} style={{ marginBottom: 10 }} />
      <NeedsYou q={pairing} />
      <SessionsSection q={sessions} />
      <ShellsSection q={shells} />
      <JobsSection q={cron} />
      <RunsSection q={cronLogs} />
      <BackupsSection q={backups} />
      <BoardLine q={kanban} />
      <NavCard
        rows={[
          { href: '/ops/files', label: 'Files', sub: 'code/ai · hub data · read-only' },
        ]}
        style={{ marginTop: 14 }}
      />
    </Screen>
  );
}

export default OpsScreen;
