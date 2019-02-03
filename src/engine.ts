import { EventEmitter } from 'events';
import { exec } from 'child_process';
import * as os from 'os';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

import axios, { AxiosResponse } from 'axios';

export class Engine<
  TProgress extends { [key: string]: Step }
> extends EventEmitter {
  protected progress: TProgress = undefined;
  protected hasPrinted: boolean = false;
  protected hasFailed: boolean = false;

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
          console.log(`\x1b[31m✗ ${step.title} >>>> ${step.reason}\x1b[0m`);
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

  protected async exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.trace(
        '====================' +
          os.EOL +
          'Running command:' +
          os.EOL +
          command +
          os.EOL,
      );
      exec(command, (error, stdout, stderr) => {
        if (stderr && !error) this.trace(stderr);
        if (stderr && error) this.failure(stderr);
        if (stdout) this.trace(stdout);
        if (error) {
          reject(stderr);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  protected async get<TData = any>(url: string): Promise<TData> {
    let res: AxiosResponse;
    try {
      this.trace(
        '====================' +
          os.EOL +
          'Web request:' +
          os.EOL +
          url +
          os.EOL,
      );
      res = await axios.get(url);
      return res.data;
    } catch (err) {
      this.failure(err.message);
      throw err.message;
    }
  }

  protected async createTemp(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.trace(
        '====================' + os.EOL + 'Creating temp folder:' + os.EOL,
      );
      fs.mkdtemp(path.join(os.tmpdir(), 'tbv-'), (err, folder) => {
        if (err) {
          this.failure(`${err}`);
          reject(err);
        } else {
          this.trace(folder);
          resolve(folder);
        }
      });
    });
  }

  protected async readJson<TData = any>(filename: string): Promise<TData> {
    return new Promise((resolve, reject) => {
      this.trace(
        '====================' +
          os.EOL +
          `Reading file "${filename}":` +
          os.EOL,
      );
      fs.readFile(filename, (err, data) => {
        if (err) {
          this.failure(`${err}`);
          reject(err);
        } else {
          try {
            const json = JSON.parse(data.toString());
            this.trace(JSON.stringify(json, null, '  '));
            resolve(json);
          } catch (parseErr) {
            this.failure(`${parseErr}`);
            reject(`${parseErr}`);
          }
        }
      });
    });
  }

  protected updateProgress(
    step: keyof TProgress,
    status: Step['status'],
    reason?: string,
  ) {
    this.progress[step].status = status;
    if (reason) this.progress[step].reason = reason;
    if (status === 'fail') this.hasFailed = true;
    this.emit('progress', this.progress);
  }

  protected failure(message: string) {
    this.emit('failure', message);
  }
  protected warning(message: string) {
    this.emit('warning', message);
  }
  protected notice(message: string) {
    this.emit('notice', message);
  }
  protected trace(message: string) {
    this.emit('trace', message);
  }
}

export type Step = {
  status: 'pass' | 'fail' | 'warn' | 'skipped' | 'pending' | 'working';
  title: string;
  reason?: string;
};
