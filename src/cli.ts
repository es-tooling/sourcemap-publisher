import {fdir} from 'fdir';
import {cli, define} from 'gunshi';
import path from 'node:path';
import * as prompt from '@clack/prompts';
import {readFile, stat, writeFile} from 'node:fs/promises';

async function getFiles(paths: string[]): Promise<string[]> {
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
    .crawl()
    .withPromise();
  return files;
}

const command = define({
  name: 'publish',
  description: 'Publishes sourcemaps externally',
  options: {},
  async run(ctx) {
    const cwd = process.cwd();
    const paths = (
      ctx.positionals.length > 0 ? ctx.positionals : ['dist/']
    ).map((p) => path.join(cwd, p));
    const files = await getFiles(paths);
    // TODO (jg): maybe one day paralellise this with a concurrency limit
    for (const file of files) {
      let contents: string;

      try {
        contents = await readFile(file, 'utf8');
      } catch {
        prompt.log.warn(`Could not load file ${file}, skipping.`);
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
        prompt.log.warn(
          `Could not load sourcemap file ${sourcemapPath}, skipping.`
        );
        continue;
      }

      const sourcemapRelativePath = path.relative(cwd, sourcemapPath);
      // TODO (43081j): get pkg-name from somewhere
      const sourcemapNewPath = `https://example.com/pkg-name/${sourcemapRelativePath}`;

      const newSourcemapLine =
        lastLine.slice(0, sourcemapMatch.indices[1][0]) +
        sourcemapNewPath +
        lastLine.slice(sourcemapMatch.indices[1][1]);

      await writeFile(
        file,
        contents.slice(0, contents.lastIndexOf('\n') + 1) + newSourcemapLine
      );
    }
    console.log(files);
  }
});

await cli(process.argv.slice(2), command, {
  name: 'sourcemap-publisher',
  version: '0.0.1',
  description: 'Publishes sourcemaps externally'
});
