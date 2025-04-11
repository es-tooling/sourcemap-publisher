import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

export interface PackageJson {
  name: string;
  version: string;
  files?: string[];
  [key: string]: unknown;
}

export const readPackageJson = async (p: string): Promise<PackageJson> => {
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

const packageJsonKeysToStrip = ['exports', 'bin'];

export async function preparePackageJson(
  cwd: string,
  packageJsonPath: string,
  packageJson: PackageJson,
  paths: string[]
): Promise<void> {
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
}
