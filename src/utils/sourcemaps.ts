import {readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {type PackageJson} from './package-json.js';

export function createExternalSourcemapUrl(
  p: string,
  packageJson: PackageJson
): string {
  return `https://unpkg.com/${packageJson.name}@${packageJson.version}/${p}`;
}

export interface UpdateSourceMapUrlsResult {
  skipped: string[];
}

export async function updateSourceMapUrls(
  cwd: string,
  files: string[],
  packageJson: PackageJson
): Promise<UpdateSourceMapUrlsResult> {
  const result: UpdateSourceMapUrlsResult = {skipped: []};
  // TODO (jg): maybe one day paralellise this with a concurrency limit
  for (const file of files) {
    let contents: string;

    try {
      contents = await readFile(file, 'utf8');
    } catch {
      result.skipped.push(file);
      continue;
    }

    const trimmedContents = contents.trim();
    const lastLine = trimmedContents.slice(
      trimmedContents.lastIndexOf('\n') + 1
    );
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
      result.skipped.push(file);
      continue;
    }

    const sourcemapRelativePath = path.relative(cwd, sourcemapPath);
    // TODO (43081j): get pkg-name from somewhere
    const sourcemapNewPath = createExternalSourcemapUrl(
      sourcemapRelativePath,
      packageJson
    );

    const newSourcemapLine =
      sourcemapMatch[0].slice(0, sourcemapMatch.indices[1][0]) +
      sourcemapNewPath +
      sourcemapMatch[0].slice(sourcemapMatch.indices[1][1]);

    await writeFile(
      file,
      contents.slice(0, contents.lastIndexOf('\n') + 1) + newSourcemapLine
    );
  }

  return result;
}
