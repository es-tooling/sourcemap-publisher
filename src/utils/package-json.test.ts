import {suite, test, expect, beforeEach, afterEach} from 'vitest';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {
  PackageJson,
  preparePackageJson,
  readPackageJson
} from './package-json.js';
import {tmpdir} from 'node:os';

suite('readPackageJson', () => {
  let tempDir: string;
  let pkgPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'smpub'));
    pkgPath = path.join(tempDir, 'package.json');
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  test('throws on non-existent package.json', async () => {
    await expect(async () => {
      await readPackageJson(pkgPath);
    }).rejects.toThrow('Could not load `package.json` file');
  });

  test('throws on invalid JSON', async () => {
    await writeFile(pkgPath, '{');
    await expect(async () => {
      await readPackageJson(pkgPath);
    }).rejects.toThrow('Could not parse `package.json` file');
  });

  test('throws when package.json is not an object', async () => {
    await writeFile(pkgPath, '[]');
    await expect(async () => {
      await readPackageJson(pkgPath);
    }).rejects.toThrow('Invalid `package.json` file');
  });

  test('throws when package.json is null', async () => {
    await writeFile(pkgPath, 'null');
    await expect(async () => {
      await readPackageJson(pkgPath);
    }).rejects.toThrow('Invalid `package.json` file');
  });

  test('throws when package.json name is missing', async () => {
    await writeFile(pkgPath, JSON.stringify({version: '1.0.0'}));
    await expect(async () => {
      await readPackageJson(pkgPath);
    }).rejects.toThrow('Invalid `package.json` file: missing name');
  });

  test('throws when package.json version is missing', async () => {
    await writeFile(pkgPath, JSON.stringify({name: 'test'}));
    await expect(async () => {
      await readPackageJson(pkgPath);
    }).rejects.toThrow('Invalid `package.json` file: missing version');
  });

  test('throws when package.json file list is missing', async () => {
    await writeFile(pkgPath, JSON.stringify({name: 'test', version: '1.0.0'}));
    await expect(async () => {
      await readPackageJson(pkgPath);
    }).rejects.toThrow('Invalid `package.json` file: missing files list');
  });

  test('returns valid package.json object', async () => {
    const pkg = {name: 'test', version: '1.0.0', files: []};
    await writeFile(pkgPath, JSON.stringify(pkg));
    const result = await readPackageJson(pkgPath);
    expect(result).toEqual(pkg);
  });
});

suite('preparePackageJson', () => {
  let tempDir: string;
  let pkgPath: string;
  let pkg: PackageJson;

  beforeEach(async () => {
    pkg = {
      name: 'test-package',
      version: '1.0.0',
      main: './lib/main.js',
      files: ['lib/**/*.js'],
      exports: {
        '.': './lib/main.js'
      },
      bin: {
        foo: './lib/cli.js'
      },
      scripts: {}
    };
    tempDir = await mkdtemp(path.join(tmpdir(), 'smpub'));
    pkgPath = path.join(tempDir, 'package.json');
    await writeFile(pkgPath, JSON.stringify(pkg));
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  test('prepares package correctly', async () => {
    await preparePackageJson(tempDir, pkgPath, pkg);

    const newPkg = await JSON.parse(await readFile(pkgPath, 'utf8'));

    expect(newPkg).toEqual({
      name: 'test-package',
      version: '1.0.0-sourcemaps',
      main: './stub.js',
      files: ['./stub.js', './**/*.map'],
      scripts: {}
    });
  });

  test('handles prerelease versions', async () => {
    pkg.version = '1.0.0-alpha';

    await preparePackageJson(tempDir, pkgPath, pkg);

    const newPkg = await JSON.parse(await readFile(pkgPath, 'utf8'));

    expect(newPkg.version).toBe('1.0.0-alpha.sourcemaps');
  });
});
