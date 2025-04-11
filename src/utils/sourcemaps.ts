import {readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {type PackageJson} from './package-json.js';
import * as prompts from '@clack/prompts';

export function createExternalSourcemapUrl(
  p: string,
  packageJson: PackageJson
): string {
  return `https://unpkg.com/${packageJson.name}@${packageJson.version}/${p}`;
}

export async function updateSourceMapUrls(
  cwd: string,
  files: string[],
  packageJson: PackageJson
): Promise<void> {
  // TODO (jg): maybe one day paralellise this with a concurrency limit
  for (const file of files) {
    let contents: string;

    try {
      contents = await readFile(file, 'utf8');
    } catch {
      // TODO (jg): should this function really know about prompts?
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
}
