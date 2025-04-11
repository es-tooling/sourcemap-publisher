import {x} from 'tinyexec';
import {Command, define} from 'gunshi';
import path from 'node:path';
import * as prompts from '@clack/prompts';
import {rm} from 'node:fs/promises';
import {
  type PackageJson,
  preparePackageJson,
  readPackageJson
} from '../utils/package-json.js';
import {
  copyRelativeFilesToDir,
  getSourceFilesFromPaths,
  getTempDir
} from '../utils/fs.js';
import {updateSourceMapUrls} from '../utils/sourcemaps.js';

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
  name: 'publish',
  description: 'Publishes sourcemaps externally',
  options,
  async run(ctx) {
    prompts.intro('Publishing sourcemaps...');

    const cwd = process.cwd();
    const paths = ctx.positionals.length > 0 ? ctx.positionals : ['dist/'];
    const dryRun = ctx.values['dry-run'];
    const provenance = ctx.values.provenance;

    const tempDir = await getTempDir(cwd, '.sourcemap-publish');

    try {
      await copyRelativeFilesToDir([...filesToKeep, ...paths], cwd, tempDir);

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

      const files = await getSourceFilesFromPaths(tempDir, resolvedPaths);

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
        await preparePackageJson(tempDir, packageJsonPath, packageJson, paths);
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
