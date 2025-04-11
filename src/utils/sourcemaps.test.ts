import {suite, test, expect, beforeEach, afterEach, vi} from 'vitest';
import * as prompts from '@clack/prompts';
import {createExternalSourcemapUrl, updateSourceMapUrls} from './sourcemaps.js';
import type {PackageJson} from './package-json.js';
import {mkdtemp, readFile, rm, writeFile} from 'fs/promises';
import path from 'path';
import {tmpdir} from 'os';

suite('createExternalSourcemapUrl', () => {
  test('should template url', () => {
    const file = 'foo/bar.js';
    const pkg: PackageJson = {
      name: 'test-package',
      version: '1.0.0-sourcemaps'
    };
    expect(createExternalSourcemapUrl(file, pkg)).toBe(
      'https://unpkg.com/test-package@1.0.0-sourcemaps/foo/bar.js.map'
    );
  });
});

const writeFiles = async (
  files: Record<string, string>,
  cwd: string
): Promise<void> => {
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(cwd, name), content);
  }
};

suite('updateSourceMapUrls', () => {
  let pkg: PackageJson;
  let tempDir: string;
  let files: Record<string, string>;

  beforeEach(async () => {
    pkg = {
      name: 'test-package',
      version: '1.0.0'
    };

    tempDir = await mkdtemp(path.join(tmpdir(), 'smpub'));

    files = {
      'foo.js': `
// This is a test file
//# sourceMappingURL=foo.js.map`,
      'bar.js': `
// This is a test file
//# sourceMappingURL=foo.js.map`,
      'bar.js.map': '// x',
      'foo.js.map': '// x'
    };

    await writeFiles(files, tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
    vi.restoreAllMocks();
  });

  test('warns on non-existent file', async () => {
    const logSpy = vi.spyOn(prompts.log, 'warn').mockImplementation(() => {});

    await updateSourceMapUrls(
      tempDir,
      [path.join(tempDir, 'non-existent.js')],
      pkg
    );

    expect(logSpy).toHaveBeenCalledWith(
      `Could not load file ${path.join(tempDir, 'non-existent.js')}, skipping.`
    );
  });

  test('ignores files with no source maps', async () => {
    const filePath = path.join(tempDir, 'no-sourcemap.js');
    const contents = '// This is a test file';

    files['no-sourcemap.js'] = contents;

    await writeFiles(files, tempDir);

    await updateSourceMapUrls(tempDir, [filePath], pkg);

    const actualContents = await readFile(filePath, 'utf8');

    expect(actualContents).toBe(contents);
  });

  test('ignores sourcemaps in weird places', async () => {
    const filePath = path.join(tempDir, 'funky-sourcemaps.js');
    const contents = `
303;
//# sourceMappingURL=funky-sourcemaps.js.map
808;`;

    files['funky-sourcemaps.js'] = contents;

    await writeFiles(files, tempDir);

    await updateSourceMapUrls(tempDir, [filePath], pkg);

    const actualContents = await readFile(filePath, 'utf8');

    expect(actualContents).toBe(contents);
  });

  test('ignores absolute URLs', async () => {
    const filePath = path.join(tempDir, 'absolute-url.js');
    const contents = `
// This is a test file
//# sourceMappingURL=/absolute/path/to/sourcemap.js.map`;

    files['absolute-url.js'] = contents;

    await writeFiles(files, tempDir);

    await updateSourceMapUrls(tempDir, [filePath], pkg);

    const actualContents = await readFile(filePath, 'utf8');

    expect(actualContents).toBe(contents);
  });

  test('ignores URLs with a protocol', async () => {
    const filePath = path.join(tempDir, 'protocol.js');
    const contents = `
// This is a test file
//# sourceMappingURL=https://example.com/sourcemap.js.map`;

    files['protocol.js'] = contents;

    await writeFiles(files, tempDir);

    await updateSourceMapUrls(tempDir, [filePath], pkg);

    const actualContents = await readFile(filePath, 'utf8');

    expect(actualContents).toBe(contents);
  });

  test('ignores inline sourcemaps', async () => {
    const filePath = path.join(tempDir, 'inline.js');
    const contents = `
// This is a test file
//# sourceMappingURL=data:application/json;base64,wooowooowooo`;

    files['inline.js'] = contents;

    await writeFiles(files, tempDir);

    await updateSourceMapUrls(tempDir, [filePath], pkg);

    const actualContents = await readFile(filePath, 'utf8');

    expect(actualContents).toBe(contents);
  });

  test('warns on non-existent sourcemap', async () => {
    const logSpy = vi.spyOn(prompts.log, 'warn').mockImplementation(() => {});

    files['non-existent-map.js'] = `
// This is a test file
//# sourceMappingURL=non-existent-map.js.map`;

    await writeFiles(files, tempDir);

    await updateSourceMapUrls(
      tempDir,
      ['non-existent-map.js', 'foo.js'].map((file) => path.join(tempDir, file)),
      pkg
    );

    const mapPath = path.join(tempDir, 'non-existent-map.js.map');

    expect(logSpy).toHaveBeenCalledWith(
      `Could not load sourcemap file ${mapPath}, skipping.`
    );

    const fooContents = await readFile(path.join(tempDir, 'foo.js'), 'utf8');

    expect(fooContents).toMatchSnapshot();
  });

  test('replaces urls with CDN urls', async () => {
    const paths = [...Object.keys(files)].map((file) =>
      path.join(tempDir, file)
    );
    await updateSourceMapUrls(tempDir, paths, pkg);

    for (const p of paths) {
      const contents = await readFile(p, 'utf8');

      expect(contents).toMatchSnapshot();
    }
  });
});
