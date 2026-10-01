// Getting a picture into a message: from the library, or off the clipboard.
//
// the user asked for both — "wire up a + button on the message bar for docs/images"
// and "make it so i can paste pictures into the chat bar". Neither could ride
// an OTA: expo-image-picker and expo-clipboard are native modules, which is
// what build 12 is for.
//
// The pieces that decide anything live here rather than in the composer, so
// they can be tested without a camera roll: what the server will take, how big
// is too big, and what to say when a picture cannot be used.
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../lib/api';

/** hub-api stores at most this per image (chat/routes.py MAX_MEDIA_DECODED_BYTES
 * is 8 MiB); the picker is asked to compress below it rather than the upload
 * failing after the wait. */
export const MAX_BYTES = 8 * 1024 * 1024;
export const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
/** Enough for a screenshot to stay readable, small enough to send on LTE. */
const QUALITY = 0.7;

export interface PendingImage {
  id: string;
  uri: string;
  mime: string;
  bytes: number;
}

export function tooBig(bytes: number): boolean {
  return bytes > MAX_BYTES;
}

/** base64 has no length header, so this is the decoded size of a data string —
 * checked before the upload rather than after it. */
export function decodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function mimeOf(asset: { mimeType?: string | null; uri?: string }): string {
  const given = (asset.mimeType || '').toLowerCase();
  if (ACCEPTED.includes(given)) return given;
  const ext = (asset.uri || '').split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export type AttachOutcome =
  | { ok: true; image: PendingImage }
  | { ok: false; reason: 'cancelled' | 'denied' | 'empty' | 'too_big' | 'failed' };

/** The camera roll. Permission is asked for at the moment he taps + — the one
 * time the ask makes sense — and a denial is reported rather than swallowed. */
export async function pickImage(threadId: string): Promise<AttachOutcome> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'denied' };
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: QUALITY,
      base64: true,
      exif: false,
    });
    if (picked.canceled || picked.assets.length === 0) return { ok: false, reason: 'cancelled' };
    const asset = picked.assets[0];
    if (!asset.base64) return { ok: false, reason: 'empty' };
    return upload(threadId, asset.base64, mimeOf(asset), asset.uri, asset.width, asset.height);
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Whatever is on the clipboard, when it is a picture. Returns `empty` when it
 * is not, so the composer can fall back to pasting text. */
export async function pasteImage(threadId: string): Promise<AttachOutcome> {
  try {
    if (!(await Clipboard.hasImageAsync())) return { ok: false, reason: 'empty' };
    const image = await Clipboard.getImageAsync({ format: 'jpeg', jpegQuality: QUALITY });
    if (!image?.data) return { ok: false, reason: 'empty' };
    // getImageAsync hands back a data URL; the server wants the payload alone.
    const base64 = image.data.includes(',') ? image.data.split(',')[1] : image.data;
    return upload(threadId, base64, 'image/jpeg', image.data, image.size?.width, image.size?.height);
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** An image the system paste button handed over (modules/paste-control). It
 * arrives already decoded as JPEG bytes, so it skips the clipboard read that
 * would otherwise make iOS ask permission, and joins the same upload path as
 * the picker's images. */
export async function attachPastedImage(
  threadId: string,
  image: { base64: string; mime: string; width: number; height: number },
): Promise<AttachOutcome> {
  return upload(threadId, image.base64, image.mime, `data:${image.mime};base64,${image.base64}`, image.width, image.height);
}

async function upload(
  threadId: string,
  base64: string,
  mime: string,
  uri: string,
  width?: number,
  height?: number,
): Promise<AttachOutcome> {
  const bytes = decodedBytes(base64);
  if (bytes === 0) return { ok: false, reason: 'empty' };
  if (tooBig(bytes)) return { ok: false, reason: 'too_big' };
  try {
    const { media_id } = await api.chatUploadMedia(threadId, {
      mime,
      data_b64: base64,
      width: width ?? null,
      height: height ?? null,
    });
    return { ok: true, image: { id: media_id, uri, mime, bytes } };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export const ATTACH_MESSAGE: Record<Exclude<AttachOutcome, { ok: true }>['reason'], string> = {
  cancelled: '',
  denied: 'Hub needs access to your photos — turn it on in Settings › Hub.',
  empty: 'Nothing to attach — the clipboard has no picture in it.',
  too_big: 'That picture is over 8 MB. Send a smaller one.',
  failed: "Couldn't attach that one.",
};
