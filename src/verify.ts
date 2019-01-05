import * as fs from 'fs';
import { exec } from 'child_process';
import * as path from 'path';
import * as os from 'os';

import axios from 'axios';
import * as del from 'del';

export async function verify(
  packageName: string,
  version?: string,
): Promise<void> {
  const hashes = await getHashes(packageName, version);

  if (!hashes.repoUrl) {
    console.error(
      `Could not find repository URL for ${hashes.packageName}@${
        hashes.version
      }`,
    );
    process.exit(1);
  }

  if (!hashes.gitHead) {
    console.error(
      `Could not find git head for ${hashes.packageName}@${hashes.version}`,
    );
    process.exit(1);
  }

  const dir = await getShallowClone(hashes);
  const shasum = await getNpmShasum(dir);

  console.log();
  console.log(`expected shasum => ${hashes.shasum}`);
  console.log(`  actual shasum => ${shasum}`);
  console.log();

  if (hashes.shasum === shasum) {
    console.log(
      `Shasum of package ${hashes.packageName}@${
        hashes.version
      } matches code at ${hashes.repoUrl} (${hashes.gitHead.substring(0, 7)})`,
    );
    console.log();
  } else {
    console.log(
      `Shasum of package ${hashes.packageName}@${
        hashes.version
      } does not match code at ${hashes.repoUrl} (${hashes.gitHead.substring(
        0,
        7,
      )})`,
    );
    console.log();
    process.exit(1);
  }
}

async function getHashes(
  packageName: string,
  version?: string,
): Promise<PackageHashes> {
  const res = await axios.get(`https://registry.npmjs.com/${packageName}`);

  const v = version || (res.data['dist-tags'] && res.data['dist-tags'].latest);

  const meta = res.data.versions && res.data.versions[v];

  const repo =
    meta &&
    meta.repository &&
    meta.repository.type === 'git' &&
    meta.repository.url;

  const gitHead = meta && meta.gitHead;

  const shasum = meta && meta.dist && meta.dist.shasum;

  return {
    packageName,
    version: meta ? v : undefined,
    repoUrl: repo.substring(4),
    gitHead,
    shasum,
  };
}

async function getShallowClone(hashes: PackageHashes): Promise<string> {
  const cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbv-'));
  process.chdir(dir);

  console.log(
    `Shallow cloning ${hashes.packageName}@${hashes.version} from ${
      hashes.repoUrl
    } ...`,
  );

  await gitInit();
  await gitAddRemote(hashes.repoUrl);
  try {
    await gitShallowFetchByCommit(hashes.gitHead);
  } catch (err) {
    console.error(
      `WARNING: git HEAD ${
        hashes.gitHead
      } could not be fetched. Fetching by tag instead.`,
    );
    await gitShallowFetchByTag(hashes.version);
  }
  await gitCheckoutFetchHead();

  console.log(`Cloned at ${hashes.gitHead}`);

  process.chdir(cwd);
  return dir;
}

function gitInit(): Promise<void> {
  return new Promise((resolve, reject) => {
    exec('git init', (error, stdout, stderr) => {
      if (error) reject(new Error('Cannot run git init'));
      else resolve();
    });
  });
}

function gitAddRemote(origin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`git remote add origin "${origin}"`, (error, stdout, stderr) => {
      if (error) reject(new Error(`Cannot add remote ${origin}`));
      else resolve();
    });
  });
}

function gitShallowFetchByCommit(sha1: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`git fetch --depth 1 origin ${sha1}`, (error, stdout, stderr) => {
      if (error) reject(new Error(`Cannot fetch ${sha1}`));
      else resolve();
    });
  });
}

function gitShallowFetchByTag(version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`git fetch --depth 1 origin v${version}`, (error, stdout, stderr) => {
      if (error) reject(new Error(`Cannot fetch tag v${version}`));
      else resolve();
    });
  });
}

function gitCheckoutFetchHead(): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`git checkout FETCH_HEAD`, (error, stdout, stderr) => {
      if (error) reject(new Error('Cannot checkout FETCH_HEAD'));
      else resolve();
    });
  });
}

async function getNpmShasum(dir: string): Promise<string> {
  const cwd = process.cwd();
  process.chdir(dir);

  let pack = '';
  try {
    pack = await npmPack();
  } catch (e) {
    console.log(
      'Installing dependencies for npm prepack. This may take a while ...',
    );
    await npmCi();
    pack = await npmPack();
  }

  process.chdir(cwd);

  const shasum = /shasum:\s+([0-9a-f]{40})/.exec(pack)[1];

  return shasum;
}

function npmCi(): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`npm ci`, (error, stdout, stderr) => {
      if (error) reject(new Error('Cannot run npm ci'));
      else resolve(stderr + stdout);
    });
  });
}

function npmPack(): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`npm pack --dry-run`, (error, stdout, stderr) => {
      if (error) reject(new Error('Cannot run npm pack'));
      else resolve(stderr + stdout);
    });
  });
}

type PackageHashes = {
  packageName: string;
  version: string;
  repoUrl: string;
  gitHead: string;
  shasum: string;
};
