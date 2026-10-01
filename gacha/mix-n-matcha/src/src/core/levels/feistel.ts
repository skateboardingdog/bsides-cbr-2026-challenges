import type { GraphSpec, Params } from '../graph';
import { Builder, playerStartingGraph, type Ref } from '../graphBuilder';
import { buildLevelChallenge, type Challenge } from '../challenge';
import { FEISTEL_SBOX } from '../nodeKinds';

export const BLOCK_WIDTH = 32;
export const HALF_WIDTH = 16;
export const ROUNDS = 2;
export const ROTATE_BY = 6;
export const KEY_SCHEDULE: string[] = ['ffaf', '371c'];
export const CIPHERTEXT = 'b6afd6b9';

const rotParams = (): Params => ({ dir: 'left', amount: ROTATE_BY });

const roundKeyType = (index: number): string => `roundKey${index + 1}`;

const COL_L = 40;
const COL_MID = 260;
const COL_R = 480;
const COL_K = 700;
const ROUND_H = 380;
const ROUND_Y0 = 200;

export function buildEncryptionGraph(): GraphSpec {
  const b = new Builder();

  b.add('in', 'input', {}, COL_MID, 0, 'Plaintext');
  b.add('sp', 'splitHalf', {}, COL_MID, 90);
  b.wire({ node: 'in', port: 'out' }, 'sp', 'in');

  let L: Ref = { node: 'sp', port: 'hi' };
  let R: Ref = { node: 'sp', port: 'lo' };

  for (let r = 0; r < ROUNDS; r++) {
    const y = ROUND_Y0 + r * ROUND_H;
    const k = `k${r}`;
    const xk = `xk${r}`;
    const rot = `rot${r}`;
    const sb = `sb${r}`;
    const xf = `xf${r}`;

    b.add(k, roundKeyType(r), {}, COL_K, y);
    b.add(xk, 'xor', {}, COL_R, y);
    b.add(rot, 'rotate', rotParams(), COL_R, y + 90);
    b.add(sb, 'sbox', { cellWidth: 4, table: FEISTEL_SBOX }, COL_R, y + 180);
    b.add(xf, 'xor', {}, COL_L, y + 180);

    b.wire(R, xk, 'a');
    b.wire({ node: k, port: 'out' }, xk, 'b');
    b.wire({ node: xk, port: 'out' }, rot, 'in');
    b.wire({ node: rot, port: 'out' }, sb, 'in');

    b.wire(L, xf, 'a');
    b.wire({ node: sb, port: 'out' }, xf, 'b');

    L = R;
    R = { node: xf, port: 'out' };
  }

  const yEnd = ROUND_Y0 + ROUNDS * ROUND_H;
  b.add('cc', 'joinHalves', {}, COL_MID, yEnd);
  b.add('out', 'output', {}, COL_MID, yEnd + 90, 'Ciphertext');
  b.wire(L, 'cc', 'a');
  b.wire(R, 'cc', 'b');
  b.wire({ node: 'cc', port: 'out' }, 'out', 'in');

  return b.build();
}

export function buildChallenge(): Challenge {
  return buildLevelChallenge({
    id: 'level3-feistel2',
    blockWidth: BLOCK_WIDTH,
    keySchedule: KEY_SCHEDULE,
    keyWidth: HALF_WIDTH,
    encryption: buildEncryptionGraph(),
    ciphertext: CIPHERTEXT,
    palette: ['xor', 'splitHalf', 'joinHalves', 'sbox', 'rotate', 'roundKey1', 'roundKey2'],
    budget: { roundKey1: 1, roundKey2: 1, splitHalf: 1, joinHalves: 1 },
    startingGraph: playerStartingGraph(),
  });
}
