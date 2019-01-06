import * as path from 'path';

import { Engine, Step } from './engine';

export class Tester extends Engine<TestProgress> {
  async test(): Promise<boolean> {
    this.progress = createProgress();
    this.hasPrinted = false;

    const { repoUrl } = await this.getRepo();
    if (this.hasFailed) return false;

    const { localShasum } = await this.packLocal();
    if (this.hasFailed) return false;

    const { tempDir, localCommit } = await this.checkout(repoUrl);
    if (this.hasFailed) return false;

    const { remoteShasum } = await this.packRemote(tempDir);
    if (this.hasFailed) return false;

    this.compare(localShasum, remoteShasum);
    if (this.hasFailed) return false;

    return true;
  }

  private async getRepo(): Promise<{ repoUrl?: string }> {
    this.updateProgress('repo', 'working');

    // read package.json
    let packageJson: any;
    try {
      packageJson = await this.readJson(
        path.join(process.cwd(), 'package.json'),
      );
    } catch (err) {
      this.updateProgress('repo', 'fail', 'Error reading package.json');
      return {};
    }

    // look for repository data
    const repository = packageJson && packageJson.repository;
    if (!repository) {
      this.updateProgress(
        'repo',
        'fail',
        'Repository not defined in package.json',
      );
      return {};
    }

    // Ensure git repo
    if (repository.type !== 'git') {
      this.updateProgress(
        'repo',
        'fail',
        'Non-git repository defined in package.json',
      );
      return {};
    }

    // Ensure URL exists
    if (!repository.url) {
      this.updateProgress(
        'repo',
        'fail',
        'Repository URL not defined in package.json',
      );
      return {};
    }

    this.updateProgress('repo', 'pass');
    return { repoUrl: repository.url };
  }

  private async packLocal(): Promise<{ localShasum?: string }> {
    this.updateProgress('packLocal', 'working');

    // npm pack
    let stdout = '';
    try {
      stdout = await this.exec('npm pack --dry-run');
    } catch (err) {
      this.updateProgress(
        'packLocal',
        'fail',
        'Error creating package from local files',
      );
      return {};
    }

    // parse shasum from stdout
    let localShasum = '';
    try {
      localShasum = /shasum:\s+([0-9a-f]{40})/.exec(stdout)[1];
    } catch (parseErr) {
      this.updateProgress(
        'packLocal',
        'fail',
        'Error parsing shasum from pack output',
      );
      return {};
    }

    this.updateProgress('packLocal', 'pass');
    return { localShasum };
  }

  private async checkout(
    repoUrl,
  ): Promise<{ tempDir?: string; localCommit?: string }> {
    this.updateProgress('checkout', 'working');
    const cwd = process.cwd();
    let tempDir = '';

    // Create temp directory
    try {
      tempDir = await this.createTemp();
    } catch (err) {
      this.updateProgress('checkout', 'fail', 'Error creating temp directory');
      return {};
    }

    // get current commit hash
    let localCommit = '';
    try {
      localCommit = await this.exec('git log --format="%H" -n 1');
    } catch (err) {
      this.updateProgress(
        'checkout',
        'fail',
        'Unable to determine current local commit',
      );
      return {};
    }

    process.chdir(tempDir);

    // git init
    try {
      await this.exec('git init');
    } catch (err) {
      this.updateProgress(
        'checkout',
        'fail',
        'Error initializing git repo in temp directory',
      );
      process.chdir(cwd);
      return { localCommit };
    }

    // add remote
    try {
      await this.exec(`git remote add origin "${repoUrl}"`);
    } catch (err) {
      this.updateProgress(
        'checkout',
        'fail',
        'Error initializing git repo in temp directory',
      );
      process.chdir(cwd);
      return { localCommit };
    }

    // fetch commit from remote
    try {
      await this.exec(`git fetch --depth 1 origin ${localCommit}`);
    } catch (err) {
      this.updateProgress(
        'checkout',
        'fail',
        `Unable fetch local commit from remote (${localCommit.substring(
          0,
          7,
        )})`,
      );
      process.chdir(cwd);
      return { localCommit };
    }

    // checkout fetch head
    try {
      await this.exec('git checkout FETCH_HEAD');
    } catch (err) {
      this.updateProgress('checkout', 'fail', 'Unable to checkout FETCH_HEAD');
      process.chdir(cwd);
      return { localCommit };
    }

    process.chdir(cwd);
    this.updateProgress('checkout', 'pass');
    return { tempDir, localCommit };
  }

  private async packRemote(
    tempDir: string,
  ): Promise<{ remoteShasum?: string }> {
    this.updateProgress('packRemote', 'working');

    const cwd = process.cwd();
    process.chdir(tempDir);

    // npm pack
    let stdout: string = null;
    let failedWithoutDependencies = false;
    try {
      stdout = await this.exec(`npm pack --dry-run`);
      this.updateProgress('install', 'skipped');
    } catch (err) {
      failedWithoutDependencies = true;
    }

    if (failedWithoutDependencies) {
      // install dependencies
      try {
        this.updateProgress(
          'packRemote',
          'pending',
          'Waiting for dependencies',
        );
        this.updateProgress('install', 'working');
        await this.exec(`npm ci`);
        this.updateProgress('install', 'pass');
      } catch (err) {
        this.updateProgress('install', 'fail', 'Error installing dependencies');
        process.chdir(cwd);
        return {};
      }

      // npm pack (again)
      try {
        this.updateProgress('packRemote', 'working');
        stdout = await this.exec(`npm pack --dry-run`);
      } catch (err) {
        this.updateProgress(
          'packRemote',
          'fail',
          'Error creating package from remote files' + err,
        );
        process.chdir(cwd);
        return {};
      }
    }

    // parse shasum from stdout
    let remoteShasum = '';
    try {
      remoteShasum = /shasum:\s+([0-9a-f]{40})/.exec(stdout)[1];
    } catch (parseErr) {
      this.updateProgress(
        'packRemote',
        'fail',
        'Error parsing shasum from pack output',
      );
      process.chdir(cwd);
      return {};
    }

    this.updateProgress('packRemote', 'pass');
    process.chdir(cwd);
    return { remoteShasum };
  }

  private compare(localShasum: string, remoteShasum: string): void {
    this.updateProgress('compare', 'working');

    if (localShasum === remoteShasum) {
      this.updateProgress('compare', 'pass');
    } else {
      this.updateProgress('compare', 'fail', 'Shasums do not match');
    }
  }
}

function createProgress(): TestProgress {
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
      title: 'Install dependencies',
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
