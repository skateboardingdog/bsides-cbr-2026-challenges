import type { Challenge } from '../challenge';
import { buildChallenge as buildXor } from './xor';
import { buildChallenge as buildSpn } from './spn';
import { buildChallenge as buildFeistel } from './feistel';

export interface LevelMeta {
  id: string;
  shortLabel: string;
  build: () => Challenge;
}

export const LEVELS: LevelMeta[] = [
  { id: 'level1-xor', shortLabel: 'Level 1', build: buildXor },
  { id: 'level2-spn', shortLabel: 'Level 2', build: buildSpn },
  { id: 'level3-feistel2', shortLabel: 'Level 3', build: buildFeistel },
];

export function buildLevelChallenges(): Challenge[] {
  return LEVELS.map((l) => l.build());
}
