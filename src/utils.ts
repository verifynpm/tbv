import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import { Readable } from 'stream';

import * as gunzip from 'gunzip-maybe';
import { extract } from 'tar-stream';

export type Manifest = { [filepath: string]: string };
export type Diff = { added: string[]; modified: string[]; removed: string[] };

export async function getManifestFromUri(url: string): Promise<Manifest> {
  return new Promise((resolve, reject) => {
    try {
      https.get(url, res => {
        resolve(getManifestFromStream(res));
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function getManifestFromFile(filepath: string): Promise<Manifest> {
  return getManifestFromStream(fs.createReadStream(filepath));
}

export function compareManifests(a: Manifest, b: Manifest): Diff {
  const diff: Diff = { added: [], modified: [], removed: [] };
  for (const filepath in a) {
    if (!b[filepath]) {
      diff.removed.push(filepath);
    } else if (a[filepath] !== b[filepath]) {
      diff.modified.push(filepath);
    }
  }

  for (const filepath in b) {
    if (!a[filepath]) {
      diff.added.push(filepath);
    }
  }

  return diff;
}

export async function getManifestFromStream(
  readable: Readable,
): Promise<Manifest> {
  return new Promise((resolve, reject) => {
    try {
      const manifest = {};
      const extractor = extract();

      readable.pipe(gunzip({ maxRecursion: 3 })).pipe(extractor);
      readable.on('error', reject);

      extractor.on('entry', (header, stream, next) => {
        try {
          const hash = crypto.createHash('sha1', { encoding: 'hex' });
          stream.pipe(hash);

          stream.on('error', reject);

          stream.on('end', () => {
            try {
              manifest[header.name] = hash.read();
              next();
            } catch (err) {
              reject(err);
            }
          });
        } catch (err) {
          reject(err);
        }
      });

      extractor.on('finish', () => resolve(manifest));
    } catch (err) {
      reject(err);
    }
  });
}
