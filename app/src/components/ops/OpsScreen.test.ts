// opsNavRows: the Murmur nav row must be absent unless the server confirms a
// bridge is configured (app: make the Murmur panel optional). Pure-logic
// test — see OpsScreen.tsx for why this is extracted rather than rendered.
import { opsNavRows } from './OpsScreen';

function labels(murmurConfigured: boolean | undefined): string[] {
  return opsNavRows(murmurConfigured).map((r) => r.label);
}

test('unconfigured (false) has no Murmur row', () => {
  expect(labels(false)).toEqual(['Feed', 'Agent spend', 'Terminal']);
});

test('while the configured check is in flight (undefined), Murmur stays hidden', () => {
  // Fails closed: no flash of a row that then disappears once the read settles.
  expect(labels(undefined)).toEqual(['Feed', 'Agent spend', 'Terminal']);
});

test('configured (true) shows Murmur between Agent spend and Terminal', () => {
  expect(labels(true)).toEqual(['Feed', 'Agent spend', 'Murmur', 'Terminal']);
});
