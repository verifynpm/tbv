#!/usr/bin/env node

import { Verifier } from './verifier';
import { Tester } from './tester';

const task = process.argv[2];
const mode = process.argv[4];

if (task === 'test') {
  const tester = new Tester();
  if (mode === '--verbose') {
    tester.on('failure', console.error);
    tester.on('warning', console.error);
    tester.on('notice', console.log);
    tester.on('trace', console.log);
  } else {
    tester.on('progress', progress => tester.printSteps(progress));
  }
  tester.test().then(success => {
    if (success) {
      console.log();
      console.log('\x1b[32mPASSED\x1b[0m');
      console.log();
    } else {
      console.log();
      console.error('\x1b[31mFAILED\x1b[0m');
      console.log();
      process.exit(1);
    }
  });
} else if (task === 'verify') {
  const verifier = new Verifier();
  if (mode === '--verbose') {
    verifier.on('failure', console.error);
    verifier.on('warning', console.error);
    verifier.on('notice', console.log);
    verifier.on('trace', console.log);
  } else {
    verifier.on('progress', progress => verifier.printSteps(progress));
  }

  const [packageName, version] = process.argv[3].split('@');
  verifier.verify(packageName, version).then(success => {
    if (success) {
      console.log();
      console.log('\x1b[32mPASSED\x1b[0m');
      console.log();
    } else {
      console.log();
      console.error('\x1b[31mFAILED\x1b[0m');
      console.log();
      process.exit(1);
    }
  });
} else {
  console.error('Please supply task {verify|test}');
}
