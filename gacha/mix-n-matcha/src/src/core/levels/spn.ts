import type { GraphSpec } from '../graph';
import { Builder, playerStartingGraph } from '../graphBuilder';
import { buildLevelChallenge, type Challenge } from '../challenge';
import { SPN_SBOX } from '../nodeKinds';

export const BLOCK_WIDTH = 32;
export const KEY_SCHEDULE: string[] = ['c3bb94f1', '2eb4b66b'];
export const CIPHERTEXT = 'bf9bb068';
export const ROTATE_BY = 7;

export function buildEncryptionGraph(): GraphSpec {
  const b = new Builder();

  b.add('in', 'input', {}, 170, 0, 'Plaintext');
  b.add('k0', 'roundKey1', {}, 400, 60);
  b.add('xk0', 'xor', {}, 170, 100);
  b.add('sb', 'sbox', { cellWidth: 4, table: SPN_SBOX }, 170, 200);
  b.add('rot', 'rotate', { dir: 'left', amount: ROTATE_BY }, 170, 300);
  b.add('k1', 'roundKey2', {}, 400, 380);
  b.add('xk1', 'xor', {}, 170, 400);
  b.add('out', 'output', {}, 170, 500, 'Ciphertext');

  b.wire({ node: 'in', port: 'out' }, 'xk0', 'a');
  b.wire({ node: 'k0', port: 'out' }, 'xk0', 'b');
  b.wire({ node: 'xk0', port: 'out' }, 'sb', 'in');
  b.wire({ node: 'sb', port: 'out' }, 'rot', 'in');
  b.wire({ node: 'rot', port: 'out' }, 'xk1', 'a');
  b.wire({ node: 'k1', port: 'out' }, 'xk1', 'b');
  b.wire({ node: 'xk1', port: 'out' }, 'out', 'in');

  return b.build();
}

export function buildChallenge(): Challenge {
  return buildLevelChallenge({
    id: 'level2-spn',
    blockWidth: BLOCK_WIDTH,
    keySchedule: KEY_SCHEDULE,
    keyWidth: BLOCK_WIDTH,
    encryption: buildEncryptionGraph(),
    ciphertext: CIPHERTEXT,
    palette: ['xor', 'sbox', 'rotate', 'roundKey1', 'roundKey2'],
    budget: { roundKey1: 1, roundKey2: 1, sbox: 1 },
    startingGraph: playerStartingGraph(),
  });
}
