import { EventEmitter } from 'events';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

import axios, { AxiosResponse, AxiosError } from 'axios';

export class Verifier extends EventEmitter {
  private progress: VerifyProgress = undefined;
  private hasPrinted: boolean;

  private updateVerifyProgress(
    step: keyof VerifyProgress,
    status: Step['status'],
    reason?: string,
  ) {
    this.progress[step].status = status;
    if (reason) this.progress[step].reason = reason;
    this.emit('progress', this.progress);
  }

  async test() {}

  async verify(packageName: string, version?: string): Promise<Result> {
    this.progress = createVerifyProgress();
    this.hasPrinted = false;

    const hashes = await this.getInfoFromRegistry(packageName, version);

    if (!hashes.repoUrl) {
      const message = `Could not find repository URL for ${
        hashes.packageName
      }@${hashes.version}`;

      this.failure(message);
      return {
        success: false,
        reason: message,
      };
    }

    if (!hashes.gitHead) {
      this.warning(
        `WANRING: Could not find git head for ${hashes.packageName}@${
          hashes.version
        }`,
      );
    }

    const { dir, fetchHead } = await this.getShallowClone(hashes);

    if (!fetchHead) {
      const message = 'Could not create shallow clone';
      this.failure(message);
      return {
        success: false,
        reason: message,
      };
    }

    const shasum = await this.getNpmShasum(dir);

    this.notice(
      `${os.EOL}expected shasum => ${hashes.shasum}${
        os.EOL
      }  actual shasum => ${shasum}${os.EOL}`,
    );

    this.updateVerifyProgress('compare', 'working');
    if (hashes.shasum === shasum) {
      const message = `Shasum of package ${hashes.packageName}@${
        hashes.version
      } matches code at ${hashes.repoUrl} (${fetchHead})${os.EOL}`;

      this.notice(message);
      this.updateVerifyProgress('compare', 'pass');
      return {
        success: true,
        reason: message,
      };
    } else {
      const message = `Shasum of package ${hashes.packageName}@${
        hashes.version
      } does not match code at ${hashes.repoUrl} (${fetchHead})${os.EOL}`;
      this.failure(message);
      this.updateVerifyProgress('compare', 'fail', message);
      return {
        success: false,
        reason: message,
      };
    }
  }

  async getInfoFromRegistry(
    packageName: string,
    version?: string,
  ): Promise<PackageHashes> {
    this.updateVerifyProgress('registry', 'working');
    let res: AxiosResponse;
    try {
      res = await axios.get(`https://registry.npmjs.com/${packageName}`);
      this.updateVerifyProgress('registry', 'pass');
    } catch (err) {
      this.updateVerifyProgress(
        'registry',
        'fail',
        (err as AxiosError).message,
      );
    }

    const v =
      version || (res.data['dist-tags'] && res.data['dist-tags'].latest);

    const meta = res.data.versions && res.data.versions[v];

    this.updateVerifyProgress('repo', 'working');
    const repo =
      meta &&
      meta.repository &&
      meta.repository.type === 'git' &&
      meta.repository.url;
    if (repo) {
      this.updateVerifyProgress('repo', 'pass');
    } else {
      this.updateVerifyProgress('repo', 'fail', 'No repository defined');
    }

    this.updateVerifyProgress('gitHead', 'working');
    const gitHead = meta && meta.gitHead;
    if (gitHead) {
      this.updateVerifyProgress('gitHead', 'pass');
    } else {
      this.updateVerifyProgress('gitHead', 'warn', 'gitHead not found');
    }

    const shasum = meta && meta.dist && meta.dist.shasum;

    return {
      packageName,
      version: meta ? v : undefined,
      repoUrl: repo.substring(4),
      gitHead,
      shasum,
    };
  }

  async getShallowClone(
    hashes: PackageHashes,
  ): Promise<{ dir: string; fetchHead: string }> {
    const cwd = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbv-'));
    process.chdir(dir);

    this.notice(
      `Shallow cloning ${hashes.packageName}@${hashes.version} from ${
        hashes.repoUrl
      } ...`,
    );

    let fetchHead = '';

    try {
      this.updateVerifyProgress('checkout', 'working');
      await this.gitInit();
      await this.gitAddRemote(hashes.repoUrl);
      if (hashes.gitHead) {
        try {
          fetchHead = await this.gitShallowFetchByCommit(hashes.gitHead);
        } catch (err) {
          this.warning(
            `WARNING: gitHead ${
              hashes.gitHead
            } could not be fetched. Fetching by tag instead.`,
          );
          fetchHead = await this.gitShallowFetchByTag(hashes.version);
        }
      } else {
        fetchHead = await this.gitShallowFetchByTag(hashes.version);
      }
      await this.gitCheckoutFetchHead();
      this.notice(`Cloned at ${fetchHead}`);
      this.updateVerifyProgress('checkout', 'pass');
    } catch (err) {
      this.failure(`Fatal error cloning`);
      this.updateVerifyProgress('checkout', 'fail', err);
      fetchHead = undefined;
    }

    process.chdir(cwd);
    return { dir, fetchHead };
  }

  private gitInit(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec('git init', (error, stdout, stderr) => {
        if (error) {
          this.failure(stderr);
          reject(new Error('Cannot run git init'));
        } else resolve();
      });
    });
  }

  private gitAddRemote(origin: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`git remote add origin "${origin}"`, (error, stdout, stderr) => {
        if (error) {
          this.failure(stderr);
          reject(new Error(`Cannot add remote ${origin}`));
        } else resolve();
      });
    });
  }

  private gitShallowFetchByCommit(sha1: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(`git fetch --depth 1 origin ${sha1}`, (error, stdout, stderr) => {
        if (error) {
          this.failure(stderr);
          reject(new Error(`Cannot fetch ${sha1}`));
        } else resolve(sha1);
      });
    });
  }

  private gitShallowFetchByTag(version: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        `git fetch --depth 1 origin tags/v${version}`,
        (error1, stdout1, stderr1) => {
          if (error1) {
            // this.error(stderr);

            exec(
              `git fetch --depth 1 origin tags/${version}`,
              (error2, stdout2, stderr2) => {
                if (error2) {
                  //this.error(stderr);
                  reject(
                    new Error(`Cannot fetch tag ${version} or v${version}`),
                  );
                } else resolve(`tags/${version}`);
              },
            );
          } else resolve(`tags/v${version}`);
        },
      );
    });
  }

  private gitCheckoutFetchHead(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`git checkout FETCH_HEAD`, (error, stdout, stderr) => {
        if (error) {
          this.failure(stderr);
          reject(new Error('Cannot checkout FETCH_HEAD'));
        } else resolve();
      });
    });
  }

  private async getNpmShasum(dir: string): Promise<string> {
    const cwd = process.cwd();
    process.chdir(dir);

    let pack = '';
    try {
      this.updateVerifyProgress('pack', 'working');
      pack = await this.npmPack();
      this.updateVerifyProgress('install', 'skipped');
      this.updateVerifyProgress('pack', 'pass');
    } catch (e) {
      this.notice(
        'Installing dependencies for npm prepack. This may take a while ...',
      );
      this.updateVerifyProgress('install', 'working');
      await this.npmCi();
      this.updateVerifyProgress('install', 'pass');
      pack = await this.npmPack();
      this.updateVerifyProgress('pack', 'pass');
    }

    process.chdir(cwd);

    const shasum = /shasum:\s+([0-9a-f]{40})/.exec(pack)[1];

    return shasum;
  }

  private npmCi(): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(`npm ci`, (error, stdout, stderr) => {
        if (error) {
          this.failure(stderr);
          reject(new Error('Cannot run npm ci'));
        } else resolve(stderr + stdout);
      });
    });
  }

  private npmPack(): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(`npm pack --dry-run`, (error, stdout, stderr) => {
        if (error) {
          this.failure(stderr);
          reject(new Error('Cannot run npm pack'));
        } else resolve(stderr + stdout);
      });
    });
  }

  private failure(message: string) {
    this.emit('failure', message);
  }
  private warning(message: string) {
    this.emit('warning', message);
  }
  private notice(message: string) {
    this.emit('notice', message);
  }
  private trace(message: string) {
    this.emit('trace', message);
  }

  printSteps(steps: { [key: string]: Step }) {
    if (this.hasPrinted) {
      const lineCount = Object.keys(steps).length;
      readline.moveCursor(process.stdout, 0, -lineCount);
    }

    for (const key in steps) {
      const step = steps[key] as Step;
      switch (step.status) {
        case 'pass':
          if (this.hasPrinted) readline.clearLine(process.stdout, 0);
          console.log(`\x1b[32m✓\x1b[0m ${step.title}`);
          break;
        case 'fail':
          if (this.hasPrinted) readline.clearLine(process.stdout, 0);
          console.log(`\x1b[31m✗ ${step.title}\x1b[0m`);
          break;
        case 'warn':
          if (this.hasPrinted) readline.clearLine(process.stdout, 0);
          console.log(`\x1b[33m- ${step.title} [WARNING]\x1b[0m`);
          break;
        case 'skipped':
          if (this.hasPrinted) readline.clearLine(process.stdout, 0);
          console.log(`\x1b[36m- ${step.title} [SKIPPED]\x1b[0m`);
          break;
        case 'pending':
          if (this.hasPrinted) readline.clearLine(process.stdout, 0);
          console.log(`- ${step.title}`);
          break;
        case 'working':
          if (this.hasPrinted) readline.clearLine(process.stdout, 0);
          console.log(`\x1b[37m> ${step.title}\x1b[0m`);
          break;
      }
    }

    this.hasPrinted = true;
  }
}

export type Result = {
  success: boolean;
  reason: string;
};

type PackageHashes = {
  packageName: string;
  version: string;
  repoUrl: string;
  gitHead: string;
  shasum: string;
};

export type Step = {
  status: 'pass' | 'fail' | 'warn' | 'skipped' | 'pending' | 'working';
  title: string;
  reason?: string;
};

function createVerifyProgress(): VerifyProgress {
  return {
    registry: {
      status: 'pending',
      title: 'Fetch package data from registry',
    },
    repo: {
      status: 'pending',
      title: 'Version contains repository URL',
    },
    gitHead: {
      status: 'pending',
      title: 'Version contains gitHead',
    },
    checkout: {
      status: 'pending',
      title: 'Shallow checkout',
    },
    install: {
      status: 'pending',
      title: 'Install npm packages',
    },
    pack: {
      status: 'pending',
      title: 'Create package',
    },
    compare: {
      status: 'pending',
      title: 'Compare shasums',
    },
  };
}

export type VerifyProgress = {
  registry: Step;
  repo: Step;
  gitHead: Step;
  checkout: Step;
  install: Step;
  pack: Step;
  compare: Step;
};

function createTestProgress(): TestProgress {
  return {
    repo: {
      status: 'pending',
      title: 'Package includes repository',
    },
    packLocal: {
      status: 'pending',
      title: 'Create package from local directory',
    },
    checkout: {
      status: 'pending',
      title: 'Shallow checkout from repo',
    },
    install: {
      status: 'pending',
      title: 'Install npm packages',
    },
    packRemote: {
      status: 'pending',
      title: 'Create package from remote repository',
    },
    compare: {
      status: 'pending',
      title: 'Compare shasums',
    },
  };
}

export type TestProgress = {
  repo: Step;
  packLocal: Step;
  checkout: Step;
  install: Step;
  packRemote: Step;
  compare: Step;
};
