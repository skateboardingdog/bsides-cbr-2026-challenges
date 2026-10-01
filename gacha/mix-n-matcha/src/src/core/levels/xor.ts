import type { GraphSpec } from '../graph';
import { Builder, playerStartingGraph } from '../graphBuilder';
import { buildLevelChallenge, type Challenge } from '../challenge';

export const BLOCK_WIDTH = 32;
export const KEY_SCHEDULE: string[] = ['b491bdf5', '6e89d357'];
export const CIPHERTEXT = 'bd7701c6';

function buildGraph(inputLabel: string, outputLabel: string): GraphSpec {
  const b = new Builder();

  b.add('in', 'input', {}, 170, 0, inputLabel);
  b.add('k0', 'roundKey1', {}, 400, 100);
  b.add('x0', 'xor', {}, 170, 120);
  b.add('k1', 'roundKey2', {}, 400, 220);
  b.add('x1', 'xor', {}, 170, 240);
  b.add('out', 'output', {}, 170, 360, outputLabel);

  b.wire({ node: 'in', port: 'out' }, 'x0', 'a');
  b.wire({ node: 'k0', port: 'out' }, 'x0', 'b');
  b.wire({ node: 'x0', port: 'out' }, 'x1', 'a');
  b.wire({ node: 'k1', port: 'out' }, 'x1', 'b');
  b.wire({ node: 'x1', port: 'out' }, 'out', 'in');

  return b.build();
}

export function buildEncryptionGraph(): GraphSpec {
  return buildGraph('Plaintext', 'Ciphertext');
}

export function buildChallenge(): Challenge {
  return buildLevelChallenge({
    id: 'level1-xor',
    blockWidth: BLOCK_WIDTH,
    keySchedule: KEY_SCHEDULE,
    keyWidth: BLOCK_WIDTH,
    encryption: buildEncryptionGraph(),
    ciphertext: CIPHERTEXT,
    palette: ['xor', 'roundKey1', 'roundKey2'],
    budget: { roundKey1: 1, roundKey2: 1 },
    startingGraph: playerStartingGraph(),
  });
}
