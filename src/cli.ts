import {fdir} from 'fdir';
import {x} from 'tinyexec';
import {cli, define} from 'gunshi';
import path from 'node:path';
import * as prompts from '@clack/prompts';
import {readFile, stat, writeFile, mkdir, rm, cp} from 'node:fs/promises';

async function getFiles(cwd: string, paths: string[]): Promise<string[]> {
  const crawler = new fdir();
  const files = await crawler
    .withFullPaths()
    .exclude((_dirName, dirPath) => {
      return !paths.some((p) => dirPath.startsWith(p));
    })
    .filter((file) => {
      return (
        paths.some((p) => file.startsWith(p)) &&
        (file.endsWith('.js') ||
          (!file.endsWith('.d.ts') && file.endsWith('.ts')))
      );
    })
    .crawl(cwd)
    .withPromise();
  return files;
}

interface PackageJson {
  name: string;
  version: string;
  files?: string[];
  [key: string]: unknown;
}

const readPackageJson = async (p: string): Promise<PackageJson> => {
  let packageJson: string;

  try {
    packageJson = await readFile(p, 'utf8');
  } catch {
    throw new Error('Could not load `package.json` file');
  }

  let obj: Record<string, unknown>;

  try {
    obj = JSON.parse(packageJson);
  } catch {
    throw new Error('Could not parse `package.json` file');
  }

  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Invalid `package.json` file');
  }

  if (typeof obj.name !== 'string') {
    throw new Error('Invalid `package.json` file: missing name');
  }

  if (typeof obj.version !== 'string') {
    throw new Error('Invalid `package.json` file: missing version');
  }

  return obj as PackageJson;
};

const filesToKeep = ['.npmrc', '.npmignore', 'package.json'];
const getTempDir = async (p: string): Promise<string> => {
  const tempDir = path.join(p, '.sourcemap-output');

  await rm(tempDir, {force: true, recursive: true});
  await mkdir(tempDir);

  return tempDir;
};
const copyFilesToDir = async (
  files: string[],
  sourceDir: string,
  targetDir: string
): Promise<void> => {
  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    try {
      await stat(sourcePath);
      await cp(sourcePath, targetPath, {recursive: true});
    } catch {
      continue;
    }
  }
};

const createExternalSourcemapUrl = (
  p: string,
  packageJson: PackageJson
): string =>
  `https://unpkg.com/${packageJson.name}@${packageJson.version}/${p}`;

const updateSourceMapUrls = async (
  cwd: string,
  files: string[],
  packageJson: PackageJson
): Promise<void> => {
  // TODO (jg): maybe one day paralellise this with a concurrency limit
  for (const file of files) {
    let contents: string;

    try {
      contents = await readFile(file, 'utf8');
    } catch {
      prompts.log.warn(`Could not load file ${file}, skipping.`);
      continue;
    }

    const lastLine = contents.slice(contents.lastIndexOf('\n') + 1);
    const sourcemapPattern = /^\/\/# sourceMappingURL=(.+)/d;
    const sourcemapMatch = lastLine.match(sourcemapPattern);

    if (!sourcemapMatch || !sourcemapMatch.indices) {
      continue;
    }

    const sourcemapURL = sourcemapMatch[1];

    // Don't support absolute URLs, or URLs with a protocol
    if (sourcemapURL.startsWith('/') || /^\w+:\/\//.test(sourcemapURL)) {
      continue;
    }

    // Ignore inline maps
    if (sourcemapURL.startsWith('data:')) {
      continue;
    }

    const sourcemapPath = path.join(path.dirname(file), sourcemapURL);

    try {
      await stat(sourcemapPath);
    } catch {
      prompts.log.warn(
        `Could not load sourcemap file ${sourcemapPath}, skipping.`
      );
      continue;
    }

    const sourcemapRelativePath = path.relative(cwd, sourcemapPath);
    // TODO (43081j): get pkg-name from somewhere
    const sourcemapNewPath = createExternalSourcemapUrl(
      sourcemapRelativePath,
      packageJson
    );

    const newSourcemapLine =
      lastLine.slice(0, sourcemapMatch.indices[1][0]) +
      sourcemapNewPath +
      lastLine.slice(sourcemapMatch.indices[1][1]);

    await writeFile(
      file,
      contents.slice(0, contents.lastIndexOf('\n') + 1) + newSourcemapLine
    );
  }
};

const packageJsonKeysToStrip = ['exports', 'bin'];

const updatePackageJsonFiles = async (
  cwd: string,
  packageJsonPath: string,
  packageJson: PackageJson,
  paths: string[]
): Promise<void> => {
  const files: string[] = ['./stub.js'];
  const isPreRelease = packageJson.version.includes('-');
  const versionSep = isPreRelease ? '.' : '-';
  const version = `${packageJson.version}${versionSep}sourcemaps`;
  const newPackageJson: PackageJson = {
    ...packageJson,
    files,
    main: './stub.js',
    version
  };

  for (const path of paths) {
    files.push(`${path}/**/*.map`);
  }

  for (const key of packageJsonKeysToStrip) {
    newPackageJson[key] = undefined;
  }

  await writeFile(packageJsonPath, JSON.stringify(newPackageJson, null, 2));
  await writeFile(path.join(cwd, './stub.js'), '');
};

const command = define({
  name: 'publish',
  description: 'Publishes sourcemaps externally',
  options: {
    provenance: {
      type: 'boolean',
      description: 'Enable provenance when publishing to npm',
      default: false
    },
    'dry-run': {
      type: 'boolean',
      description: 'Dry run, do not publish',
      default: false
    }
  },
  async run(ctx) {
    prompts.intro('Publishing sourcemaps...');

    const cwd = process.cwd();
    const paths = ctx.positionals.length > 0 ? ctx.positionals : ['dist/'];
    const dryRun = ctx.values['dry-run'];
    const provenance = ctx.values.provenance;

    const tempDir = await getTempDir(cwd);

    try {
      await copyFilesToDir([...filesToKeep, ...paths], cwd, tempDir);

      const packageJsonPath = path.join(tempDir, 'package.json');
      let packageJson: PackageJson | null;

      try {
        packageJson = await readPackageJson(packageJsonPath);
      } catch (err) {
        prompts.log.error(`${err}`);
        prompts.cancel(
          'Failed to read package.json. Please ensure you run this command in the project directory'
        );
        return;
      }

      const resolvedPaths = paths.map((p) => path.join(tempDir, p));

      const files = await getFiles(tempDir, resolvedPaths);

      if (files.length === 0) {
        prompts.cancel('No files were found to publish!');
        return;
      }

      try {
        await updateSourceMapUrls(tempDir, files, packageJson);
      } catch (err) {
        prompts.log.error(`${err}`);
        prompts.cancel('Failed to update sourcemap URLs');
        return;
      }

      try {
        await updatePackageJsonFiles(
          tempDir,
          packageJsonPath,
          packageJson,
          paths
        );
      } catch (err) {
        prompts.log.error(`${err}`);
        prompts.cancel('Failed to update package.json files');
        return;
      }

      const npmArgs: string[] = ['publish', '--tag=sourcemaps'];

      if (dryRun) {
        npmArgs.push('--dry-run');
      }

      if (provenance) {
        npmArgs.push('--provenance');
      }

      const log = prompts.taskLog({
        title: `Running npm ${npmArgs.join(' ')}`,
        limit: 10,
        retainLog: true
      });

      try {
        const publishProc = x('npm', npmArgs, {
          nodeOptions: {
            cwd: tempDir
          }
        });

        for await (const line of publishProc) {
          log.message(line);
        }

        if (publishProc.exitCode !== 0) {
          throw new Error('npm publish failed');
        }

        log.success(`npm ${npmArgs.join(' ')}`, {showLog: true});
      } catch (err) {
        log.message(`${err}\n`, {raw: true});
        log.error(`Error running npm ${npmArgs.join(' ')}`);
        prompts.cancel('Failed to publish');
        return;
      }

      prompts.outro(
        `Published sourcemaps successfully!${dryRun ? ' (Dry run)' : ''}`
      );
    } finally {
      await rm(tempDir, {force: true, recursive: true});
    }
  }
});

await cli(process.argv.slice(2), command, {
  name: 'sourcemap-publisher',
  version: '0.0.1',
  description: 'Publishes sourcemaps externally'
});
