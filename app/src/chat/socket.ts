// The one ChatSocketClient for the whole app — a module singleton, same
// shape-of-purpose as src/lib/query.ts's `queryClient`. ChatScreen (thread
// list) and ThreadScreen (transcript) both call `getChatSocket()` and get the
// SAME connection: one WebSocket, N per-thread subscriptions, so switching
// threads never tears down and re-opens the socket.
//
// Wiring only — every frame this socket receives is folded straight into
// useChatStore via the reducer (chatReducer, by way of applyFrames), and a
// 1008 (session revoked/expired) re-locks the shared useChatLock store so
// both screens see the SAME "locked" state the terminal's onLock already
// established the pattern for.
import { ChatSocketClient } from './wsClient';
import type { ChatFrame } from './types';
import { queryClient } from '../lib/query';
import { useChatLock } from './lock';
import { useChatStore } from './store';

let client: ChatSocketClient | null = null;
let detachAppState: (() => void) | null = null;

// Frames arrive one per WebSocket message, and opening a thread replays its
// entire log at once. Applying each on arrival meant a re-render per frame —
// the list visibly jumping as ~50 messages landed (the user, 2026-09-22). They are
// gathered for a tick and folded in together; a single live frame still lands
// within a frame's time, so nothing feels slower.
const COALESCE_MS = 16;
let pending: ChatFrame[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** A stale row stays stale until the snapshot lands, and every flush in
 * between would ask for the same snapshot again. */
export const REFETCH_DEBOUNCE_MS = 500;
const refetchedAt = new Map<string, number>();

/** The threads a batch leaves needing a fresh snapshot: the server said so
 * (`snapshot_required`), or the reducer marked a row stale because a delta
 * did not fit the text it holds. */
function threadsToRefetch(batch: ChatFrame[]): string[] {
  const { threads } = useChatStore.getState().chat;
  const out = new Set<string>();
  for (const frame of batch) {
    if (!('thread_id' in frame)) continue;
    if (frame.type === 'snapshot_required' || threads[frame.thread_id]?.messages.some((m) => m.stale === true)) {
      out.add(frame.thread_id);
    }
  }
  return [...out];
}

function refetch(threadId: string): void {
  const now = Date.now();
  if (now - (refetchedAt.get(threadId) ?? 0) < REFETCH_DEBOUNCE_MS) return;
  refetchedAt.set(threadId, now);
  // Never cancel a snapshot already on its way: a stale row keeps every
  // batch asking, and the default (cancel and restart) meant a fetch slower
  // than the batch cadence never finished.
  void queryClient.invalidateQueries({ queryKey: ['chat-thread', threadId] }, { cancelRefetch: false });
}

function queueFrame(frame: ChatFrame): void {
  pending.push(frame);
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const batch = pending;
    pending = [];
    useChatStore.getState().applyFrames(batch);
    // The snapshot repairs the row, and the thread screen then re-subscribes
    // from that snapshot's version (hooks.ts) so what landed after it is
    // replayed onto whole text.
    for (const threadId of threadsToRefetch(batch)) refetch(threadId);
  }, COALESCE_MS);
}

export function getChatSocket(): ChatSocketClient {
  if (!client) {
    client = new ChatSocketClient({
      onFrame: queueFrame,
      onStatus: (status) => useChatStore.getState().setConnection(status),
      onLock: () => void useChatLock.getState().lock(),
    });
    // Foreground is where a backgrounded socket is found dead. The terminal
    // wires this from its screen; chat's socket outlives any one screen, so
    // it is wired here, once, for the life of the singleton.
    detachAppState = client.attachAppState();
  }
  return client;
}

/** Test-only: drops the singleton so each test file starts with a fresh
 * client instead of leaking connect() calls across test files. */
export function resetChatSocketForTests(): void {
  detachAppState?.();
  detachAppState = null;
  client?.close();
  client = null;
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
  pending = [];
  refetchedAt.clear();
}
