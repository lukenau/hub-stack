// Getting a file into a message (2026-10-01: "he wants files in Hub chat").
// A file rides the route a picture does and differs in two ways: it keeps the
// name it came with, and the size is checked from what the picker REPORTS,
// before the file is read into memory.
jest.mock('../lib/api', () => ({ api: { chatUploadMedia: jest.fn() } }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-clipboard', () => ({ hasImageAsync: jest.fn(), getImageAsync: jest.fn() }));

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../lib/api';
import {
  attachPastedFile,
  fileMimeOf,
  formatBytes,
  isImageMime,
  MAX_BYTES,
  pickFile,
  pickImage,
} from './attachments';

const upload = api.chatUploadMedia as jest.Mock;
const picker = DocumentPicker.getDocumentAsync as jest.Mock;
const FileCtor = File as unknown as jest.Mock;

const pick = (asset: Record<string, unknown>) =>
  picker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/x', ...asset }] });

beforeEach(() => {
  jest.clearAllMocks();
  upload.mockResolvedValue({ status: 'ok', media_id: 'med_1', size_bytes: 5 });
  FileCtor.mockImplementation(() => ({ base64: async () => 'aGVsbG8=' })); // "hello", 5 bytes
});

describe('pickFile', () => {
  it('uploads the file with its type and its name, and holds it as a chip', async () => {
    pick({ name: 'report.pdf', size: 5, mimeType: 'application/pdf' });
    const out = await pickFile('thr_1');
    expect(upload).toHaveBeenCalledWith('thr_1', {
      mime: 'application/pdf', data_b64: 'aGVsbG8=', width: null, height: null, name: 'report.pdf',
    });
    expect(out).toEqual({
      ok: true,
      images: [{ id: 'med_1', uri: 'file:///cache/x', mime: 'application/pdf', bytes: 5, name: 'report.pdf' }],
    });
  });

  it('refuses a file the picker says is too big BEFORE reading it into memory', async () => {
    pick({ name: 'movie.mov', size: MAX_BYTES + 1, mimeType: 'video/quicktime' });
    expect(await pickFile('thr_1')).toEqual({ ok: false, reason: 'too_big' });
    expect(FileCtor).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('is not an error to cancel the picker', async () => {
    picker.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickFile('thr_1')).toEqual({ ok: false, reason: 'cancelled' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('sends a type that claims nothing when the picker returns garbage for one', async () => {
    pick({ name: 'mystery', size: 5, mimeType: 'not a mime' });
    await pickFile('thr_1');
    expect(upload.mock.calls[0][1].mime).toBe('application/octet-stream');
  });

  it('uploads a picture chosen from the Files app as a picture, with no name', async () => {
    pick({ name: 'scan.png', size: 5, mimeType: 'image/png' });
    await pickFile('thr_1');
    expect(upload.mock.calls[0][1]).not.toHaveProperty('name');
    expect(upload.mock.calls[0][1].mime).toBe('image/png');
  });

  it('reports a failed read or upload as failed, never a crash', async () => {
    pick({ name: 'a.pdf', size: 5, mimeType: 'application/pdf' });
    upload.mockRejectedValue(new Error('network'));
    expect(await pickFile('thr_1')).toEqual({ ok: false, reason: 'failed' });
    FileCtor.mockImplementation(() => ({ base64: async () => { throw new Error('unreadable'); } }));
    expect(await pickFile('thr_1')).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('attachPastedFile', () => {
  it('uploads what the system paste button handed over, under the name it was copied as', async () => {
    const out = await attachPastedFile('thr_1', { base64: 'aGVsbG8=', mime: 'application/pdf', name: 'copied.pdf' });
    expect(upload.mock.calls[0][1]).toMatchObject({ mime: 'application/pdf', name: 'copied.pdf' });
    expect(out).toMatchObject({ ok: true, images: [{ id: 'med_1', name: 'copied.pdf' }] });
  });

  it('refuses an empty paste and an oversized one without calling the server', async () => {
    expect(await attachPastedFile('thr_1', { base64: '', mime: 'application/pdf', name: 'a.pdf' })).toEqual({ ok: false, reason: 'empty' });
    const huge = 'A'.repeat(Math.ceil((MAX_BYTES * 4) / 3) + 8);
    expect(await attachPastedFile('thr_1', { base64: huge, mime: 'application/pdf', name: 'b.pdf' })).toEqual({ ok: false, reason: 'too_big' });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('pickImage', () => {
  const lib = ImagePicker as unknown as {
    requestMediaLibraryPermissionsAsync: jest.Mock;
    launchImageLibraryAsync: jest.Mock;
  };
  const photo = (n: number) => ({
    uri: `file:///cam/p${n}.jpg`,
    base64: 'aGVsbG8=',
    mimeType: 'image/jpeg',
    width: 10,
    height: 10,
  });
  const picked = (count: number) =>
    lib.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: Array.from({ length: count }, (_, i) => photo(i)),
    });

  beforeEach(() => {
    lib.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  });

  it('takes several pictures in one visit to the gallery, in the order he picked them', async () => {
    let n = 0;
    upload.mockImplementation(async () => ({ status: 'ok', media_id: `med_${(n += 1)}`, size_bytes: 5 }));
    picked(3);
    const out = await pickImage('thr_1', 4);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(out).toEqual({ ok: true, images: [1, 2, 3].map((i) => expect.objectContaining({ id: `med_${i}` })) });
  });

  it('asks the gallery for several, so it does not close on the first tap', async () => {
    picked(1);
    await pickImage('thr_1', 3);
    expect(lib.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 3 }),
    );
  });

  it('takes no more than the message has room for', async () => {
    picked(3);
    await pickImage('thr_1', 2);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('keeps the ones that worked when one of them will not upload', async () => {
    upload
      .mockResolvedValueOnce({ status: 'ok', media_id: 'med_1', size_bytes: 5 })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 'ok', media_id: 'med_3', size_bytes: 5 });
    picked(3);
    const out = await pickImage('thr_1', 4);
    expect(out).toMatchObject({ ok: true, images: [{ id: 'med_1' }, { id: 'med_3' }] });
  });

  it('is not an error to back out of the gallery', async () => {
    lib.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickImage('thr_1', 4)).toEqual({ ok: false, reason: 'cancelled' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('says so when the photo library is refused', async () => {
    lib.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    expect(await pickImage('thr_1', 4)).toEqual({ ok: false, reason: 'denied' });
    expect(lib.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('knows what the server will take, to the byte', () => {
    // hub-api: chat/platform.py MAX_MEDIA_DECODED_BYTES. The old figure here was 8 MiB, which is OVER it.
    expect(MAX_BYTES).toBe(7_000_000);
  });
  it('names a type, or the one that claims nothing', () => {
    expect(fileMimeOf({ mimeType: 'Application/PDF' })).toBe('application/pdf');
    expect(fileMimeOf({ mimeType: '' })).toBe('application/octet-stream');
    expect(fileMimeOf({})).toBe('application/octet-stream');
    expect(fileMimeOf({ mimeType: 'a/b/c' })).toBe('application/octet-stream');
  });
  it('tells a picture from a file', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
    expect(isImageMime('image/heic')).toBe(false); // not in the server's image set: it is a file
  });
  it('writes a size a person reads', () => {
    expect(formatBytes(14)).toBe('14 B');
    expect(formatBytes(1500)).toBe('2 KB');
    expect(formatBytes(2_500_000)).toBe('2.5 MB');
  });
});
