import {suite, beforeEach, afterEach, test, expect} from 'vitest';
import {writeFile, rm, mkdtemp, mkdir, stat} from 'node:fs/promises';
import {copyRelativeFilesToDir, getTempDir} from './fs.js';
import path from 'node:path';
import {tmpdir} from 'node:os';

const mockFs: Record<string, string> = {
  'lib/js-file.js': '// foo',
  'lib/ts-file.ts': '// foo',
  'lib/dts-file.d.ts': '// foo',
  'lib/nested/js-file.js': '// foo'
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

suite('copyRelativeFilesToDir', () => {
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

  test('copies files to target directory', async () => {
    const files = ['lib/js-file.js', 'lib/ts-file.ts'];
    await copyRelativeFilesToDir(files, tempDir, targetDir);

    await expect(
      stat(path.join(targetDir, 'lib/js-file.js'))
    ).resolves.not.toThrow();
    await expect(
      stat(path.join(targetDir, 'lib/ts-file.ts'))
    ).resolves.not.toThrow();
  });

  test('ignores non-existent files', async () => {
    const files = ['lib/js-file.js', 'lib/non-existent-file.js'];
    await copyRelativeFilesToDir(files, tempDir, targetDir);

    await expect(
      stat(path.join(targetDir, 'lib/js-file.js'))
    ).resolves.not.toThrow();
    await expect(
      stat(path.join(targetDir, 'lib/non-existent-file.js'))
    ).rejects.toThrow();
  });
});
