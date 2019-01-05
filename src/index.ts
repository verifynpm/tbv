import { verify } from './verify';
import { Verifier } from './verifier';

// export function reverseString(forward: string): string {
//   if (!forward) return forward;

//   return forward
//     .split('')
//     .reverse()
//     .join('');
// }

// console.log('This is the example typescript application!');

const task = process.argv[2];
const [packageName, version] = process.argv[3].split('@');

const verifier = new Verifier();

// verifier.on('theerror', console.error);
// verifier.on('warning', console.error);
// verifier.on('notice', console.log);
// verifier.on('trace', console.trace);

verifier.on('progress', progress => verifier.printSteps(progress));

//console.log({ task, packageName, version });

if (task === 'verify') {
  (async () => {
    const result = await verifier.verify(packageName, version);

    if (result.success) {
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
}
