// Runbooks, not a snippet pile: grouped one-tappers for the ops the user actually
// runs from a phone (Warp-workflow pattern). They FILL the composer for review
// — nothing executes on tap. 1:1 with apps/hub/src/routes/terminal/KeyBar.tsx.
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import { TerminalSheet } from './Sheet';

export interface Snippet {
  label: string;
  cmd: string;
}

export const RUNBOOKS: readonly { section: string; items: readonly Snippet[] }[] = [
  {
    section: 'Assistant',
    items: [
      { label: 'Agent health', cmd: 'hermes doctor' },
      { label: 'Cron jobs', cmd: 'hermes cron list' },
      { label: 'Run a cron job now', cmd: 'hermes cron run ' },
      { label: 'Gateway logs (live)', cmd: 'docker logs example-gateway --tail 50 -f' },
      { label: 'Sessions', cmd: 'hermes sessions list --limit 10' },
    ],
  },
  {
    section: 'Box',
    items: [
      { label: 'Containers', cmd: 'docker ps' },
      { label: 'Disk space', cmd: 'df -h /' },
      { label: 'Memory + load', cmd: 'free -h && uptime' },
      { label: 'Hub API logs', cmd: 'docker logs hub-api --tail 40' },
    ],
  },
  {
    section: 'Trading',
    items: [
      { label: 'Spindle health', cmd: 'curl -s http://127.0.0.1:8788/healthz' },
      { label: 'Journal tail', cmd: 'tail -20 /opt/hub-data/trading/journal.jsonl' },
    ],
  },
  {
    section: 'tmux',
    items: [
      { label: 'Switch to a claude session', cmd: 'tmux switch-client -t claude-' },
      { label: 'List sessions', cmd: 'tmux ls' },
      { label: 'Back to hub-term', cmd: 'tmux switch-client -t hub-term' },
      { label: 'Start claude in a background window', cmd: "tmux new-window -d -n claude 'claude'" },
      { label: 'List windows', cmd: 'tmux list-windows' },
      { label: 'Jump to window', cmd: 'tmux select-window -t ' },
    ],
  },
  {
    section: 'MacBook',
    items: [
      {
        label: 'Attach a Mac claude session (new window)',
        cmd: "tmux new-window -n mac 'ssh -t mac /opt/homebrew/bin/tmux attach -t claude-'",
      },
      { label: 'List Mac sessions', cmd: 'ssh mac /opt/homebrew/bin/tmux ls' },
      { label: 'Mac shell', cmd: 'ssh mac' },
      { label: 'Is the Mac awake?', cmd: 'tailscale ping -c 1 mac.internal.example' },
    ],
  },
];

export interface RunbooksProps {
  open: boolean;
  onClose: () => void;
  onDismissed?: () => void;
  /** Hands the command over; the screen applies it once the sheet is gone. */
  onSnippet: (cmd: string) => void;
}

export function Runbooks({ open, onClose, onDismissed, onSnippet }: RunbooksProps) {
  const { t } = useTheme();

  return (
    <TerminalSheet
      open={open}
      onClose={onClose}
      onDismissed={onDismissed}
      eyebrow="Terminal"
      title="Runbooks"
    >
      <View style={styles.body}>
        {RUNBOOKS.map((group) => (
          <Fragment key={group.section}>
            <Text style={[styles.section, { color: t('fg-4') }]}>{group.section.toUpperCase()}</Text>
            {group.items.map((snippet, i) => (
              <Pressable
                key={snippet.label}
                accessibilityRole="button"
                onPress={() => {
                  onSnippet(snippet.cmd);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.item,
                  i < group.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: t('border') },
                  // `active:opacity-70` — the runbook rows' own press state,
                  // not the shell's 0.8 PRESSED_OPACITY.
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.itemLabel, { color: t('fg-0') }]}>{snippet.label}</Text>
                <Text numberOfLines={1} style={[styles.itemCmd, { color: t('fg-3') }]}>
                  {snippet.cmd}
                </Text>
              </Pressable>
            ))}
          </Fragment>
        ))}
        <Text style={[styles.footer, { color: t('fg-4') }]}>
          runbooks fill the composer — review, edit, then send
        </Text>
      </View>
    </TerminalSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 6 },
  section: {
    fontFamily: fonts.mono(400),
    fontSize: 10,
    letterSpacing: 1.4,
    paddingTop: 8,
    paddingBottom: 4,
    marginTop: 6,
  },
  item: { minHeight: 48, paddingVertical: 11, justifyContent: 'center' },
  itemLabel: { fontFamily: fonts.sans(540), fontSize: 14 },
  itemCmd: { fontFamily: fonts.mono(400), fontSize: 11, marginTop: 2 },
  footer: { fontFamily: fonts.mono(400), fontSize: 10, paddingTop: 8 },
});
