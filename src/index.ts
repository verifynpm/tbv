import { verify } from './verify';
import { Verifier } from './verifier';
import { Tester } from './tester';

// export function reverseString(forward: string): string {
//   if (!forward) return forward;

//   return forward
//     .split('')
//     .reverse()
//     .join('');
// }

// console.log('This is the example typescript application!');

const task = process.argv[2];
//const [packageName, version] = process.argv[3].split('@');

const tester = new Tester();

// tester.on('theerror', console.error);
// tester.on('warning', console.error);
// tester.on('notice', console.log);
// tester.on('trace', console.trace);

tester.on('progress', progress => tester.printSteps(progress));

//console.log({ task, packageName, version });

//if (task === 'verify') {
  (async () => {
    const result = await tester.test();

    if (result) {
      console.log();
      console.log('\x1b[32mPASSED\x1b[0m');
      console.log();
    } else {
      console.log();
      console.error('\x1b[31mFAILED\x1b[0m');
      console.log();
      process.exit(1);
    }
  })();
//}
