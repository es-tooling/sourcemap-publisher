import {readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {type PackageJson} from './package-json.js';

export function createExternalSourcemapUrl(
  p: string,
  packageJson: PackageJson
): string {
  return `https://unpkg.com/${packageJson.name}@${packageJson.version}/${p}`;
}

export async function updateSourceMapUrls(
  cwd: string,
  sourceMaps: ExtractedSourceMapSuccess[],
  packageJson: PackageJson
): Promise<void> {
  // TODO (jg): maybe one day paralellise this with a concurrency limit
  for (const sourceMap of sourceMaps) {
    // TODO (43081j); we will already have read this file as part of
    // parsing source maps. ideally we shouldn't read it again here, but
    // storing all of the sources in memory is not a good idea either
    let contents: string;

    try {
      contents = await readFile(sourceMap.source, 'utf8');
    } catch {
      continue;
    }

    const sourcemapRelativePath = path.relative(cwd, sourceMap.path);
    const sourcemapNewPath = createExternalSourcemapUrl(
      sourcemapRelativePath,
      packageJson
    );

    await writeFile(
      sourceMap.source,
      contents.slice(0, sourceMap.range[0]) +
        sourcemapNewPath +
        contents.slice(sourceMap.range[1])
    );
  }
}

export interface ExtractedSourceMapSuccess {
  success: true;
  range: [number, number];
  path: string;
  source: string;
}

export interface ExtractedSourceMapError {
  success: false;
  source: string;
  reason: string;
}

export type ExtractedSourceMap =
  | ExtractedSourceMapSuccess
  | ExtractedSourceMapError;

export async function extractSourceMap(
  source: string
): Promise<ExtractedSourceMap> {
  let contents: string;

  try {
    contents = await readFile(source, 'utf8');
  } catch {
    return {source, success: false, reason: 'could not load source file'};
  }

  const trimmedContents = contents.trim();
  const lastLine = trimmedContents.slice(trimmedContents.lastIndexOf('\n') + 1);
  const sourcemapPattern = /^\/\/# sourceMappingURL=(.+)/d;
  const sourcemapMatch = lastLine.match(sourcemapPattern);

  if (!sourcemapMatch || !sourcemapMatch.indices) {
    return {source, success: false, reason: 'no sourcemap found'};
  }

  const sourcemapURL = sourcemapMatch[1];

  // Don't support absolute URLs, or URLs with a protocol
  if (sourcemapURL.startsWith('/') || /^\w+:\/\//.test(sourcemapURL)) {
    return {
      source,
      success: false,
      reason: 'absolute and external URLs not supported'
    };
  }

  // Ignore inline maps
  if (sourcemapURL.startsWith('data:')) {
    return {source, success: false, reason: 'data URLs not supported'};
  }

  const sourcemapPath = path.join(path.dirname(source), sourcemapURL);

  try {
    await stat(sourcemapPath);
  } catch {
    return {source, success: false, reason: 'sourcemap not found'};
  }

  return {
    success: true,
    range: sourcemapMatch.indices[1],
    path: sourcemapPath,
    source
  };
}

export async function extractSourceMaps(
  files: string[]
): Promise<ExtractedSourceMap[]> {
  const results: ExtractedSourceMap[] = [];
  for (const file of files) {
    const extracted = await extractSourceMap(file);
    results.push(extracted);
  }
  return results;
}
