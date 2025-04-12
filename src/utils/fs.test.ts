import {suite, beforeEach, afterEach, test, expect} from 'vitest';
import {writeFile, rm, mkdtemp, mkdir, stat} from 'node:fs/promises';
import {copyFileToDir, getTempDir} from './fs.js';
import path from 'node:path';
import {tmpdir} from 'node:os';

const mockFs: Record<string, string> = {
  'lib/file.js': '// foo',
  'lib/file.d.ts': '// foo'
};

const writeMockFs = async (tempDir: string) => {
  for (const [file, content] of Object.entries(mockFs)) {
    const filePath = path.join(tempDir, file);
    await mkdir(path.dirname(filePath), {recursive: true});
    await writeFile(filePath, content);
  }
};

suite('getTempDir', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'smpub'));
  });

  afterEach(async () => {
    await rm(tempDir, {force: true, recursive: true});
  });

  test('creates temporary directory', async () => {
    const result = await getTempDir(tempDir, 'woof');
    const expected = path.join(tempDir, 'woof');
    expect(result).to.equal(expected);
    await expect(stat(expected)).resolves.not.toThrow();
  });
});

suite('copyFileToDir', () => {
  let tempDir: string;
  let targetDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'smpub'));
    targetDir = await mkdtemp(path.join(tmpdir(), 'smpub'));
    await writeMockFs(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, {force: true, recursive: true});
    await rm(targetDir, {force: true, recursive: true});
  });

  test('copies file to target directory', async () => {
    const file = path.join(tempDir, 'lib/file.js');
    await copyFileToDir(file, tempDir, targetDir);

    await expect(
      stat(path.join(targetDir, 'lib/file.js'))
    ).resolves.not.toThrow();
  });

  test('ignores non-existent files', async () => {
    const file = path.join(tempDir, 'lib/non-existent.js');
    await copyFileToDir(file, tempDir, targetDir);

    await expect(
      stat(path.join(targetDir, 'lib/non-existent.js'))
    ).rejects.toThrow();
  });
});
