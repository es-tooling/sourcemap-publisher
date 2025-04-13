import {x} from 'tinyexec';
import {Command, define} from 'gunshi';
import path from 'node:path';
import {glob} from 'tinyglobby';
import * as prompts from '@clack/prompts';
import {rm} from 'node:fs/promises';
import {
  type PackageJson,
  preparePackageJson,
  readPackageJson
} from '../utils/package-json.js';
import {copyFileToDir, getTempDir} from '../utils/fs.js';
import {
  ExtractedSourceMapSuccess,
  extractSourceMaps,
  updateSourceMapUrls
} from '../utils/sourcemaps.js';

const filesToKeep = ['.npmrc', '.npmignore', 'package.json'];

const options = {
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
} as const;

export const publishCommand: Command<typeof options> = define({
  description: 'Publishes sourcemaps externally',
  options,
  async run(ctx) {
    prompts.intro('Publishing sourcemaps...');

    const cwd = process.cwd();
    const dryRun = ctx.values['dry-run'];
    const provenance = ctx.values.provenance;

    const packageJsonPath = path.join(cwd, 'package.json');
    let packageJson: PackageJson;

    try {
      packageJson = await readPackageJson(packageJsonPath);
    } catch (err) {
      prompts.log.error(`${err}`);
      prompts.cancel(
        'Failed to read package.json. Please ensure you run this command in the project directory'
      );
      process.exit(1);
    }

    let paths: string[];

    try {
      paths = await glob(packageJson.files, {
        absolute: true,
        cwd,
        onlyFiles: true
      });
    } catch (err) {
      prompts.cancel(
        'Failed to load files from `files` array in package.json.'
      );
      prompts.log.message(String(err));
      process.exit(1);
    }

    let tempDir: string | undefined;
    let exitCode = 0;

    try {
      tempDir = await getTempDir(cwd, '.sourcemap-publish');

      const tempPackageJsonPath = path.join(tempDir, 'package.json');

      const sourcePaths = paths.filter((p) => p.endsWith('.js'));
      const sourceMaps = await extractSourceMaps(sourcePaths);

      if (sourceMaps.length === 0) {
        prompts.cancel('No sourcemap files were found to publish!');
        exitCode = 1;
        return;
      }

      const successfulSourceMaps: ExtractedSourceMapSuccess[] = [];

      for (const sourceMap of sourceMaps) {
        if (sourceMap.success === false) {
          prompts.log.warn(
            `Skipping source file "${sourceMap.source}" (${sourceMap.reason})`
          );
          continue;
        }

        successfulSourceMaps.push(sourceMap);
        await copyFileToDir(sourceMap.path, cwd, tempDir);
      }

      for (const file of filesToKeep) {
        await copyFileToDir(path.join(cwd, file), cwd, tempDir);
      }

      try {
        packageJson = await preparePackageJson(
          tempDir,
          tempPackageJsonPath,
          packageJson
        );
      } catch (err) {
        prompts.log.error(`${err}`);
        prompts.cancel('Failed to update package.json files');
        exitCode = 1;
        return;
      }

      try {
        const totalSuccessfulSourceMaps = successfulSourceMaps.length;
        const totalFailedSourceMaps =
          sourceMaps.length - totalSuccessfulSourceMaps;

        if (dryRun) {
          prompts.log.info(
            `Updated ${totalSuccessfulSourceMaps} sourcemap URLs, skipped ${totalFailedSourceMaps} files (dry run)`
          );
        } else {
          await updateSourceMapUrls(cwd, successfulSourceMaps, packageJson);
          prompts.log.info(
            `Updated ${totalSuccessfulSourceMaps} sourcemap URLs, skipped ${totalFailedSourceMaps} files`
          );
        }
      } catch (err) {
        prompts.log.error(`${err}`);
        prompts.cancel('Failed to update sourcemap URLs');
        exitCode = 1;
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
        exitCode = 1;
        return;
      }

      prompts.outro(
        `Published sourcemaps successfully!${dryRun ? ' (dry run)' : ''}`
      );
    } finally {
      if (tempDir) {
        await rm(tempDir, {force: true, recursive: true});
      }
      if (exitCode > 0) {
        process.exit(exitCode);
      }
    }
  }
});
