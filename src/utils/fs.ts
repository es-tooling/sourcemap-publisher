import path from 'node:path';
import {mkdir, rm, stat, cp} from 'node:fs/promises';

export async function getTempDir(cwd: string, name: string): Promise<string> {
  const tempDir = path.join(cwd, name);

  await rm(tempDir, {force: true, recursive: true});
  await mkdir(tempDir);

  return tempDir;
}

export async function copyFileToDir(
  file: string,
  sourceDir: string,
  targetDir: string
): Promise<void> {
  const targetPath = path.join(targetDir, path.relative(sourceDir, file));
  const dir = path.dirname(targetPath);
  try {
    await stat(file);
  } catch {
    // Ignore if it doesn't exist, treat this like a "force copy"
    return;
  }
  try {
    await mkdir(dir, {recursive: true});
  } catch {
    // ignore if the dir already exists
  }
  await cp(file, targetPath, {recursive: true});
}
