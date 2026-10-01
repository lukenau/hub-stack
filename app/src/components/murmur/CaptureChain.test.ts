// Chain-state mapper tests — the pure derivations behind the capture-chain
// strip (docs/inventory/ops.md §3.3). Each stage function and chainSentence's
// priority order is exercised directly; component rendering is not (no device
// here to verify pixels against).
import {
  pendantStage,
  bridgeStage,
  pipelineStage,
  memoryStage,
  chainSentence,
  ETL_STALE_MS,
} from './CaptureChain';
import type { MurmurStatus } from '../../lib/types';

const NOW = Date.parse('2026-09-10T12:00:00.000Z');

function iso(msAgo: number, base = NOW): string {
  return new Date(base - msAgo).toISOString();
}

function status(opts: {
  pendant?: Partial<MurmurStatus['pendant']>;
  bridge?: Partial<MurmurStatus['bridge']>;
  pipeline?: Partial<MurmurStatus['pipeline']>;
  memory?: Partial<MurmurStatus['memory']>;
  chain_last_complete_at?: string | null;
} = {}): MurmurStatus {
  return {
    generated_at: iso(0),
    pendant: {
      state: 'recording',
      battery_pct: 82,
      flash_used_pages: 10,
      flash_total_pages: 100,
      bond_owner: 'iphone',
      last_status_at: iso(60_000),
      ...opts.pendant,
    },
    bridge: {
      host: 'iphone',
      up: true,
      last_heartbeat_at: iso(30_000),
      queue_wavs: 0,
      last_upload_at: iso(120_000),
      last_error: null,
      ...opts.bridge,
    },
    pipeline: {
      backend_up: true,
      conversations_today: 3,
      last_conversation_at: iso(600_000),
      marginal_rtf: 0.4,
      mongo_gb: 1.2,
      ...opts.pipeline,
    },
    memory: {
      etl_last_run_at: iso(300_000),
      etl_docs_today: 5,
      canonical_day_bytes: 2048,
      ...opts.memory,
    },
    chain_last_complete_at: 'chain_last_complete_at' in opts ? opts.chain_last_complete_at ?? null : iso(600_000),
  };
}

describe('pendantStage', () => {
  test('never_seen short-circuits to down/never bonded regardless of other fields', () => {
    expect(pendantStage(status({ pendant: { state: 'never_seen' } }))).toEqual({
      tone: 'down',
      line: 'never bonded',
    });
  });

  test('recording with battery + flash: up tone, both facts, hours scaled off the 35h buffer', () => {
    const s = status({ pendant: { state: 'recording', battery_pct: 82, flash_used_pages: 10, flash_total_pages: 100 } });
    expect(pendantStage(s)).toEqual({ tone: 'up', line: '82% · ~3.5h buffered' });
  });

  test('null battery renders "battery —", not 0%', () => {
    const s = status({ pendant: { battery_pct: null } });
    expect(pendantStage(s).line).toBe('battery — · ~3.5h buffered');
  });

  test('null flash_total_pages renders "buffer —" (missing denominator, not a measured 0)', () => {
    const s = status({ pendant: { flash_total_pages: null } });
    expect(pendantStage(s).line).toBe('82% · buffer —');
  });

  test('flash_total_pages of 0 also renders "buffer —" (falsy denominator, not a divide-by-zero)', () => {
    const s = status({ pendant: { flash_total_pages: 0 } });
    expect(pendantStage(s).line).toBe('82% · buffer —');
  });

  test('paused is warn tone', () => {
    expect(pendantStage(status({ pendant: { state: 'paused' } })).tone).toBe('warn');
  });

  test('disconnected is down tone', () => {
    expect(pendantStage(status({ pendant: { state: 'disconnected' } })).tone).toBe('down');
  });
});

describe('bridgeStage', () => {
  test('down + known host reads "unreachable"', () => {
    expect(bridgeStage(status({ bridge: { up: false, host: 'iphone' } }))).toEqual({
      tone: 'down',
      line: 'unreachable',
    });
  });

  test('down + no host reads "no bridge"', () => {
    expect(bridgeStage(status({ bridge: { up: false, host: null } }))).toEqual({
      tone: 'down',
      line: 'no bridge',
    });
  });

  test('up with heartbeat + queue: up tone, both facts', () => {
    const s = status({ bridge: { up: true, last_heartbeat_at: iso(30_000), queue_wavs: 4 } });
    expect(bridgeStage(s).tone).toBe('up');
    expect(bridgeStage(s).line).toMatch(/^.+ · 4 queued$/);
  });

  test('null heartbeat renders "seen —"', () => {
    const s = status({ bridge: { up: true, last_heartbeat_at: null, queue_wavs: 2 } });
    expect(bridgeStage(s).line).toBe('seen — · 2 queued');
  });

  test('null queue_wavs renders "queue —" (0 must NOT collapse into this)', () => {
    const zero = status({ bridge: { up: true, queue_wavs: 0 } });
    const nullQueue = status({ bridge: { up: true, queue_wavs: null } });
    expect(bridgeStage(zero).line).toMatch(/0 queued$/);
    expect(bridgeStage(nullQueue).line).toMatch(/queue —$/);
  });
});

describe('pipelineStage', () => {
  test('backend down wins over everything', () => {
    expect(pipelineStage(status({ pipeline: { backend_up: false, conversations_today: 9 } }))).toEqual({
      tone: 'down',
      line: 'backend down',
    });
  });

  test('backend up + null conversations_today reads "metrics unreadable" (warn, not a 0-conversation day)', () => {
    expect(pipelineStage(status({ pipeline: { backend_up: true, conversations_today: null } }))).toEqual({
      tone: 'warn',
      line: 'backend up · metrics unreadable',
    });
  });

  test('a measured 0 is NOT treated as "unreadable" — renders as up with "0 today"', () => {
    const s = status({ pipeline: { backend_up: true, conversations_today: 0, last_conversation_at: null } });
    expect(pipelineStage(s)).toEqual({ tone: 'up', line: '0 today · none yet' });
  });

  test('backend up + data: up tone, count + relative age', () => {
    const s = status({ pipeline: { backend_up: true, conversations_today: 3, last_conversation_at: iso(600_000) } });
    expect(pipelineStage(s).tone).toBe('up');
    expect(pipelineStage(s).line).toMatch(/^3 today · .+$/);
  });
});

describe('memoryStage', () => {
  test('no etl_last_run_at ever: down "no sync yet"', () => {
    expect(memoryStage(status({ memory: { etl_last_run_at: null } }), NOW)).toEqual({
      tone: 'down',
      line: 'no sync yet',
    });
  });

  test('run older than ETL_STALE_MS: warn "stale"', () => {
    const s = status({ memory: { etl_last_run_at: iso(ETL_STALE_MS + 1) } });
    expect(memoryStage(s, NOW).tone).toBe('warn');
    expect(memoryStage(s, NOW).line).toMatch(/^stale · synced /);
  });

  test('run exactly ETL_STALE_MS old is NOT stale (strict >, not >=)', () => {
    const s = status({ memory: { etl_last_run_at: iso(ETL_STALE_MS), etl_docs_today: 5 } });
    expect(memoryStage(s, NOW).tone).toBe('up');
  });

  test('recent run + null etl_docs_today: warn "day file unreadable"', () => {
    const s = status({ memory: { etl_last_run_at: iso(60_000), etl_docs_today: null } });
    expect(memoryStage(s, NOW).line).toMatch(/^day file unreadable · synced /);
  });

  test('recent run + measured 0 docs is up, not "unreadable"', () => {
    const s = status({ memory: { etl_last_run_at: iso(60_000), etl_docs_today: 0 } });
    expect(memoryStage(s, NOW)).toEqual({ tone: 'up', line: expect.stringMatching(/^0 today · synced /) });
  });
});

describe('chainSentence priority order', () => {
  test('never_seen beats every other signal', () => {
    const s = status({
      pendant: { state: 'never_seen' },
      bridge: { up: false },
      pipeline: { backend_up: false },
    });
    expect(chainSentence(s, NOW)).toBe('Nothing captured yet — no pendant bonded.');
  });

  test('paused beats bridge/pipeline outages', () => {
    const s = status({
      pendant: { state: 'paused' },
      bridge: { up: false },
      pipeline: { backend_up: false },
    });
    expect(chainSentence(s, NOW)).toBe('Capture is paused. Resume to keep everything in memory.');
  });

  test('disconnected + bridge up: out-of-range copy, not a data-loss claim', () => {
    const s = status({ pendant: { state: 'disconnected' }, bridge: { up: true } });
    expect(chainSentence(s, NOW)).toBe(
      'Pendant is out of range — still recording to its own flash; it drains when it reconnects.',
    );
  });

  test('disconnected + bridge down: bridge-down copy', () => {
    const s = status({ pendant: { state: 'disconnected' }, bridge: { up: false } });
    expect(chainSentence(s, NOW)).toBe(
      'The bridge is down — the pendant should still be buffering to its own flash, but nothing is syncing.',
    );
  });

  test('recording + bridge down (documented-unreachable branch, kept for parity)', () => {
    const s = status({ pendant: { state: 'recording' }, bridge: { up: false } });
    expect(chainSentence(s, NOW)).toBe('Recording locally — the bridge is down, so nothing is syncing yet.');
  });

  test('bridge up + pipeline down', () => {
    const s = status({ pendant: { state: 'recording' }, bridge: { up: true }, pipeline: { backend_up: false } });
    expect(chainSentence(s, NOW)).toBe('Bridge is up but the pipeline is down — audio is queued, not yet transcribed.');
  });

  test('everything up but no chain_last_complete_at yet', () => {
    const s = status({
      pendant: { state: 'recording' },
      bridge: { up: true },
      pipeline: { backend_up: true },
      chain_last_complete_at: null,
    });
    expect(chainSentence(s, NOW)).toBe('Capture is running; memory sync pending.');
  });

  test('unparseable chain_last_complete_at falls back to the same pending copy', () => {
    const s = status({
      pendant: { state: 'recording' },
      bridge: { up: true },
      pipeline: { backend_up: true },
      chain_last_complete_at: 'not-a-date',
    });
    expect(chainSentence(s, NOW)).toBe('Capture is running; memory sync pending.');
  });

  test('same calendar day: bare time, no date, no "nothing since"', () => {
    const s = status({
      pendant: { state: 'recording' },
      bridge: { up: true },
      pipeline: { backend_up: true },
      chain_last_complete_at: new Date(NOW).toISOString(),
    });
    const expectedTime = new Date(NOW).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    expect(chainSentence(s, NOW)).toBe(`Everything you said by ${expectedTime} is in memory.`);
  });

  test('a prior calendar day: time + date + "nothing since"', () => {
    const then = NOW - 3 * 24 * 60 * 60 * 1000; // 3 days back — clears any timezone's day boundary
    const s = status({
      pendant: { state: 'recording' },
      bridge: { up: true },
      pipeline: { backend_up: true },
      chain_last_complete_at: new Date(then).toISOString(),
    });
    const sentence = chainSentence(s, NOW);
    expect(sentence).toContain(' — nothing since.');
    expect(sentence).not.toBe('Capture is running; memory sync pending.');
    const expectedTime = new Date(then).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    expect(sentence).toContain(`Everything you said by ${expectedTime} on `);
  });
});
