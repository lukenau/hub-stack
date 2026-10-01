import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { Runbooks, RUNBOOKS } from './Runbooks';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function render(node: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>,
    );
  });
  return tree;
}

function texts(tree: TestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return out;
}

let tree: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

test('the runbook commands are the PWA\'s, verbatim', () => {
  // These are shell commands run against a live VPS: a mistyped one is a
  // wrong command in the user's composer, so they are pinned here as data.
  expect(RUNBOOKS.map((g) => g.section)).toEqual(['Assistant', 'Box', 'Trading', 'tmux', 'MacBook']);
  expect(RUNBOOKS.flatMap((g) => g.items.map((i) => i.cmd))).toEqual([
    'hermes doctor',
    'hermes cron list',
    'hermes cron run ',
    'docker logs example-gateway --tail 50 -f',
    'hermes sessions list --limit 10',
    'docker ps',
    'df -h /',
    'free -h && uptime',
    'docker logs hub-api --tail 40',
    'curl -s http://127.0.0.1:8788/healthz',
    'tail -20 /opt/hub-data/trading/journal.jsonl',
    'tmux switch-client -t claude-',
    'tmux ls',
    'tmux switch-client -t hub-term',
    "tmux new-window -d -n claude 'claude'",
    'tmux list-windows',
    'tmux select-window -t ',
    "tmux new-window -n mac 'ssh -t mac /opt/homebrew/bin/tmux attach -t claude-'",
    'ssh mac /opt/homebrew/bin/tmux ls',
    'ssh mac',
    'tailscale ping -c 1 mac.internal.example',
  ]);
});

test('the trailing-space commands keep it — they are completions, not commands', () => {
  const trailing = RUNBOOKS.flatMap((g) => g.items).filter((i) => i.cmd.endsWith(' '));
  expect(trailing.map((i) => i.label)).toEqual([
    'Run a cron job now',
    'Jump to window',
  ]);
  expect(RUNBOOKS[3].items.find((i) => i.label === 'Jump to window')?.cmd).toBe(
    'tmux select-window -t ',
  );
});

test('an open sheet lists every section, every item and the footer rule', () => {
  tree = render(<Runbooks open onClose={jest.fn()} onSnippet={jest.fn()} />);
  const rendered = texts(tree);

  expect(rendered).toContain('Runbooks');
  expect(rendered).toContain('TERMINAL');
  for (const group of RUNBOOKS) {
    expect(rendered).toContain(group.section.toUpperCase());
    for (const item of group.items) {
      expect(rendered).toContain(item.label);
      expect(rendered).toContain(item.cmd);
    }
  }
  expect(rendered).toContain('runbooks fill the composer — review, edit, then send');
});

test('a closed sheet renders nothing', () => {
  tree = render(<Runbooks open={false} onClose={jest.fn()} onSnippet={jest.fn()} />);
  expect(texts(tree)).toEqual([]);
});

test('tapping a runbook fills the composer and closes — it never executes', () => {
  const onSnippet = jest.fn();
  const onClose = jest.fn();
  tree = render(<Runbooks open onClose={onClose} onSnippet={onSnippet} />);

  const row = tree.root
    .findAll((n) => typeof n.props.onPress === 'function')
    .find((n) =>
      n.findAllByType(Text).some((inner) => inner.props.children === 'Disk space'),
    );
  act(() => row?.props.onPress());

  expect(onSnippet.mock.calls).toEqual([['df -h /']]);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('Close dismisses without filling anything', () => {
  const onSnippet = jest.fn();
  const onClose = jest.fn();
  tree = render(<Runbooks open onClose={onClose} onSnippet={onSnippet} />);

  const close = tree.root
    .findAll((n) => typeof n.props.onPress === 'function')
    .find((n) =>
      n.findAllByType(Text).some((inner) => inner.props.children === 'Close'),
    );
  act(() => close?.props.onPress());

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSnippet).not.toHaveBeenCalled();
});
