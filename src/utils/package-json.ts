import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

export interface PackageJson {
  name: string;
  version: string;
  files: string[];
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

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new Error('Invalid `package.json` file');
  }

  if (typeof obj.name !== 'string') {
    throw new Error('Invalid `package.json` file: missing name');
  }

  if (typeof obj.version !== 'string') {
    throw new Error('Invalid `package.json` file: missing version');
  }

  if (!Array.isArray(obj.files)) {
    throw new Error('Invalid `package.json` file: missing files list');
  }

  return obj as PackageJson;
};

const packageJsonKeysToStrip = ['exports', 'bin'];

export async function preparePackageJson(
  cwd: string,
  packageJsonPath: string,
  packageJson: PackageJson
): Promise<PackageJson> {
  const files: string[] = ['./stub.js', './**/*.map'];
  const isPreRelease = packageJson.version.includes('-');
  const versionSep = isPreRelease ? '.' : '-';
  const version = `${packageJson.version}${versionSep}sourcemaps`;
  const newPackageJson: PackageJson = {
    ...packageJson,
    files,
    main: './stub.js',
    version,
    scripts: {}
  };

  for (const key of packageJsonKeysToStrip) {
    newPackageJson[key] = undefined;
  }

  await writeFile(packageJsonPath, JSON.stringify(newPackageJson, null, 2));
  await writeFile(path.join(cwd, './stub.js'), '');

  return newPackageJson;
}
