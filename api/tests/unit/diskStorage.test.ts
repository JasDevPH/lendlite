import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { createDiskStorage } from '../../src/lib/storage/diskStorage';

describe('disk storage', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lendlite-disk-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('saves, reads back and removes a file', async () => {
    const storage = createDiskStorage(dir);
    await storage.save('a.pdf', Buffer.from('%PDF-hello'), 'application/pdf');
    expect(await text(await storage.read('a.pdf'))).toBe('%PDF-hello');

    await storage.remove('a.pdf');
    await expect(storage.read('a.pdf')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('never overwrites an existing file', async () => {
    const storage = createDiskStorage(dir);
    await storage.save('a.pdf', Buffer.from('first'), 'application/pdf');
    await expect(storage.save('a.pdf', Buffer.from('second'), 'application/pdf')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await text(await storage.read('a.pdf'))).toBe('first');
  });

  it('refuses keys that escape the upload folder', async () => {
    const storage = createDiskStorage(dir);
    await expect(storage.read('../../package.json')).rejects.toMatchObject({ statusCode: 404 });
    await expect(storage.save('../evil.pdf', Buffer.from('x'), 'application/pdf')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('treats removing a missing file as done', async () => {
    await expect(createDiskStorage(dir).remove('gone.pdf')).resolves.toBeUndefined();
  });
});
