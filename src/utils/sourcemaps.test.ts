import {suite, test, expect, beforeEach, afterEach, vi} from 'vitest';
import {
  createExternalSourcemapUrl,
  ExtractedSourceMapSuccess,
  extractSourceMap,
  updateSourceMapUrls
} from './sourcemaps.js';
import type {PackageJson} from './package-json.js';
import {mkdtemp, readFile, rm, writeFile} from 'fs/promises';
import path from 'path';
import {tmpdir} from 'os';

suite('createExternalSourcemapUrl', () => {
  test('should template url', () => {
    const file = 'foo/bar.js.map';
    const pkg: PackageJson = {
      name: 'test-package',
      version: '1.0.0-sourcemaps',
      files: []
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
      version: '1.0.0',
      files: []
    };

    tempDir = await mkdtemp(path.join(tmpdir(), 'smpub'));

    files = {
      'foo.js': `
// This is a test file
//# sourceMappingURL=foo.js.map`,
      'bar.js': `
// This is a test file
//# sourceMappingURL=bar.js.map`,
      'bar.js.map': '// x',
      'foo.js.map': '// x'
    };

    await writeFiles(files, tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
    vi.restoreAllMocks();
  });

  test('replaces urls with CDN urls', async () => {
    const sourceMaps: ExtractedSourceMapSuccess[] = [];

    for (const [file, source] of Object.entries(files)) {
      if (file.endsWith('.map')) {
        continue;
      }
      const substr = 'sourceMappingURL=';
      const rangeStart = source.indexOf(substr) + substr.length;
      sourceMaps.push({
        success: true,
        path: path.join(tempDir, `${file}.map`),
        source: path.join(tempDir, file),
        range: [rangeStart, source.length]
      });
    }

    await updateSourceMapUrls(tempDir, sourceMaps, pkg);

    for (const sourceMap of sourceMaps) {
      const contents = await readFile(sourceMap.source, 'utf8');

      expect(contents).toMatchSnapshot();
    }
  });
});

suite('extractSourceMap', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'smpub'));
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  test('errors when file does not exist', async () => {
    const source = path.join(tempDir, 'non-existent.js');
    const result = await extractSourceMap(source);

    expect(result).toEqual({
      source,
      success: false,
      reason: 'could not load source file'
    });
  });

  test('errors when no sourcemap URL', async () => {
    await writeFiles(
      {
        'foo.js': '// foo'
      },
      tempDir
    );
    const source = path.join(tempDir, 'foo.js');
    const result = await extractSourceMap(source);

    expect(result).toEqual({
      source,
      success: false,
      reason: 'no sourcemap found'
    });
  });

  test('errors when absolute sourcemap URL', async () => {
    await writeFiles(
      {
        'foo.js': `// foo
//# sourceMappingURL=/absolute/sourcemap.js.map`
      },
      tempDir
    );
    const source = path.join(tempDir, 'foo.js');
    const result = await extractSourceMap(source);

    expect(result).toEqual({
      source,
      success: false,
      reason: 'absolute and external URLs not supported'
    });
  });

  test('errors when external sourcemap URL', async () => {
    await writeFiles(
      {
        'foo.js': `// foo
//# sourceMappingURL=https://example.com/sourcemap.js.map`
      },
      tempDir
    );
    const source = path.join(tempDir, 'foo.js');
    const result = await extractSourceMap(source);

    expect(result).toEqual({
      source,
      success: false,
      reason: 'absolute and external URLs not supported'
    });
  });

  test('errors when data URL', async () => {
    await writeFiles(
      {
        'foo.js': `// foo
//# sourceMappingURL=data:application/json;base64,woowoo`
      },
      tempDir
    );
    const source = path.join(tempDir, 'foo.js');
    const result = await extractSourceMap(source);

    expect(result).toEqual({
      source,
      success: false,
      reason: 'data URLs not supported'
    });
  });

  test('errors when sourcemap does not exist', async () => {
    await writeFiles(
      {
        'foo.js': `// foo
//# sourceMappingURL=foo.js.map`
      },
      tempDir
    );
    const source = path.join(tempDir, 'foo.js');
    const result = await extractSourceMap(source);

    expect(result).toEqual({
      source,
      success: false,
      reason: 'sourcemap not found'
    });
  });

  test('ignores sourcemaps in weird places', async () => {
    await writeFiles(
      {
        'foo.js': `// foo
303;
//# sourceMappingURL=funky-sourcemaps.js.map
808;`
      },
      tempDir
    );
    const source = path.join(tempDir, 'foo.js');
    const result = await extractSourceMap(source);

    expect(result).toEqual({
      source,
      success: false,
      reason: 'no sourcemap found'
    });
  });

  test('retrieves sourcemap URL', async () => {
    const contents = `// foo
//# sourceMappingURL=foo.js.map`;
    await writeFiles(
      {
        'foo.js': contents,
        'foo.js.map': '// foo'
      },
      tempDir
    );
    const source = path.join(tempDir, 'foo.js');
    const result = (await extractSourceMap(
      source
    )) as ExtractedSourceMapSuccess;

    result.source = result.source.replace(tempDir, 'TEMP_DIR');
    result.path = result.path.replace(tempDir, 'TEMP_DIR');
    expect(result).toMatchSnapshot();
    expect(contents.slice(result.range[0], result.range[1])).toBe('foo.js.map');
  });
});

suite('extractSourceMaps', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'smpub'));
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  test('extracts sourcemaps from files', async () => {
    await writeFiles(
      {
        'foo.js': `// foo
//# sourceMappingURL=foo.js.map`,
        'foo.js.map': '// foo',
        'bar.js': '// i have no sourcemap'
      },
      tempDir
    );
    const source = path.join(tempDir, 'foo.js');
    const result = (await extractSourceMap(
      source
    )) as ExtractedSourceMapSuccess;

    result.source = result.source.replace(tempDir, 'TEMP_DIR');
    result.path = result.path.replace(tempDir, 'TEMP_DIR');
    expect(result).toMatchSnapshot();
  });
});
