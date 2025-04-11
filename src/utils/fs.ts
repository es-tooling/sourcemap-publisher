import {fdir} from 'fdir';
import path from 'node:path';
import {mkdir, rm, stat, cp} from 'node:fs/promises';

export async function getSourceFilesFromPaths(
  cwd: string,
  paths: string[]
): Promise<string[]> {
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

export async function getTempDir(cwd: string, name: string): Promise<string> {
  const tempDir = path.join(cwd, name);

  await rm(tempDir, {force: true, recursive: true});
  await mkdir(tempDir);

  return tempDir;
}

export async function copyRelativeFilesToDir(
  files: string[],
  sourceDir: string,
  targetDir: string
): Promise<void> {
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
}
