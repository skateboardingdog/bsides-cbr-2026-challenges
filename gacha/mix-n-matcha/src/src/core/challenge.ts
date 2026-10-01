import { z } from 'zod';
import * as B from './bitvec';
import type { BitVec } from './bitvec';
import type { GraphSpec } from './graph';
import { ALL_TYPES } from './nodeKinds';

const paramValue = z.union([z.number(), z.string(), z.boolean(), z.array(z.number())]);

const nodeSpecSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  params: z.record(z.string(), paramValue).default({}),
  label: z.string().optional(),
});

const edgeSpecSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourcePort: z.string().min(1),
  target: z.string().min(1),
  targetPort: z.string().min(1),
});

const graphSpecSchema = z.object({
  nodes: z.array(nodeSpecSchema).default([]),
  edges: z.array(edgeSpecSchema).default([]),
});

export const challengeSchema = z.object({
  id: z.string().min(1),

  blockWidth: z.number().int().positive().max(B.MAX_WIDTH),
  keySchedule: z.array(z.string()).default([]),
  keyWidth: z.number().int().positive().max(B.MAX_WIDTH).optional(),

  encryption: graphSpecSchema,
  ciphertext: z.string().default(''),

  palette: z.array(z.string()).default([...ALL_TYPES]),
  budget: z.record(z.string(), z.number().int().nonnegative()).optional(),
  showLiveValues: z.boolean().default(true),
  startingGraph: graphSpecSchema.optional(),
});

export type Challenge = z.infer<typeof challengeSchema>;

export function keyWidthOf(c: Challenge): number {
  if (c.keyWidth) return c.keyWidth;
  const first = c.keySchedule[0];
  return first ? first.replace(/^0x/i, '').replace(/[\s_]/g, '').length * 4 : c.blockWidth;
}

export function keyScheduleOf(c: Challenge): BitVec[] {
  const w = keyWidthOf(c);
  return c.keySchedule.map((hex) => {
    try {
      return B.fromHex(hex, w);
    } catch {
      return B.zero(w);
    }
  });
}

export function ciphertextOf(c: Challenge): BitVec | null {
  if (!c.ciphertext) return null;
  try {
    return B.fromHex(c.ciphertext, c.blockWidth);
  } catch {
    return null;
  }
}

export interface LevelChallengeOptions {
  id: string;
  blockWidth: number;
  keySchedule: string[];
  keyWidth?: number;
  encryption: GraphSpec;
  ciphertext: string;
  palette: string[];
  budget?: Record<string, number>;
  startingGraph?: GraphSpec;
  showLiveValues?: boolean;
}

export function buildLevelChallenge(opts: LevelChallengeOptions): Challenge {
  return challengeSchema.parse({
    id: opts.id,
    blockWidth: opts.blockWidth,
    keySchedule: opts.keySchedule,
    keyWidth: opts.keyWidth,
    encryption: opts.encryption,
    ciphertext: opts.ciphertext,
    palette: opts.palette,
    budget: opts.budget,
    showLiveValues: opts.showLiveValues ?? true,
    startingGraph: opts.startingGraph,
  });
}
