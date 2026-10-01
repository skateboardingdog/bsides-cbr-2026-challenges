import * as B from './bitvec';
import type { BitVec } from './bitvec';
import { cloneParams, pArr, pBool, pInt, pStr, type Params } from './graph';

export type Category = 'io' | 'key' | 'wiring' | 'logic' | 'arith' | 'transform';

export const CATEGORY_LABELS: Record<Category, string> = {
  io: 'Input / Output',
  key: 'Key material',
  wiring: 'Wiring',
  logic: 'Bitwise',
  arith: 'Arithmetic',
  transform: 'Transforms',
};

export interface PortDef {
  id: string;
  label: string;
}

export type ParamSpec =
  | { key: string; label: string; kind: 'int'; default: number; min?: number; max?: number; help?: string }
  | { key: string; label: string; kind: 'bool'; default: boolean; help?: string }
  | { key: string; label: string; kind: 'enum'; default: string; options: Array<{ value: string; label: string }>; help?: string }
  | { key: string; label: string; kind: 'hex'; default: string; help?: string }
  | { key: string; label: string; kind: 'text'; default: string; help?: string }
  | { key: string; label: string; kind: 'table'; default: number[]; help?: string }
  | { key: string; label: string; kind: 'permutation'; default: number[]; help?: string };

export type MaybeWidth = number | null;

export interface WidthCtx {
  params: Params;
  in: Record<string, MaybeWidth>;
  blockWidth: number;
  keyWidths: number[];
}

export interface WidthResult {
  in: Record<string, MaybeWidth>;
  out: Record<string, MaybeWidth>;
  error?: string;
}

export interface EvalCtx {
  params: Params;
  in: Record<string, BitVec>;
  blockWidth: number;
  keySchedule: BitVec[];
  channels: Record<string, BitVec>;
}

export interface NodeKind {
  type: string;
  label: string;
  category: Category;
  params: ParamSpec[];
  fixedParams?: Params;
  hidden?: boolean;
  ports(params: Params): { in: PortDef[]; out: PortDef[] };
  widths(ctx: WidthCtx): WidthResult;
  evaluate(ctx: EvalCtx): Record<string, BitVec>;
  emitChannel?(ctx: EvalCtx): { channel: string; value: BitVec } | null;
}

const NO_PORTS: PortDef[] = [];

function letterPorts(n: number): PortDef[] {
  return Array.from({ length: n }, (_, i) => {
    const id = String.fromCharCode(97 + i);
    return { id, label: id };
  });
}

function clampArity(params: Params): number {
  return Math.min(8, Math.max(2, pInt(params, 'arity', 2)));
}

function unifyWidths(ports: PortDef[], inW: Record<string, MaybeWidth>): { width: MaybeWidth; error?: string } {
  let width: MaybeWidth = null;
  for (const p of ports) {
    const w = inW[p.id];
    if (w == null) continue;
    if (width === null) width = w;
    else if (width !== w) {
      return { width, error: `operands disagree: ${width} vs ${w} bits` };
    }
  }
  return { width };
}

function sameWidthKind(
  type: string,
  label: string,
  category: Category,
  fold: (vs: BitVec[]) => BitVec,
  extra: Partial<NodeKind> = {},
): NodeKind {
  return {
    type,
    label,
    category,
    params: [{ key: 'arity', label: 'Inputs', kind: 'int', default: 2, min: 2, max: 8 }],
    ports: (params) => ({ in: letterPorts(clampArity(params)), out: [{ id: 'out', label: 'out' }] }),
    widths: ({ params, in: inW }) => {
      const ports = letterPorts(clampArity(params));
      const { width, error } = unifyWidths(ports, inW);
      const inSpec: Record<string, MaybeWidth> = {};
      for (const p of ports) inSpec[p.id] = width;
      return { in: inSpec, out: { out: width }, ...(error ? { error } : {}) };
    },
    evaluate: ({ params, in: ins }) => {
      const ports = letterPorts(clampArity(params));
      return { out: fold(ports.map((p) => ins[p.id]!)) };
    },
    ...extra,
  };
}

function roundKeyPorts(): { in: PortDef[]; out: PortDef[] } {
  return { in: NO_PORTS, out: [{ id: 'out', label: 'out' }] };
}

function roundKeyWidths({ params, keyWidths }: WidthCtx): WidthResult {
  const i = pInt(params, 'index', 0);
  const w = keyWidths[i];
  return {
    in: {},
    out: { out: w ?? null },
    ...(w === undefined ? { error: `key schedule has no round ${i}` } : {}),
  };
}

function roundKeyEvaluate({ params, keySchedule }: EvalCtx): Record<string, BitVec> {
  const i = pInt(params, 'index', 0);
  const k = keySchedule[i];
  if (!k) throw new Error(`key schedule has no round ${i}`);
  return { out: k };
}

function fixedRoundKey(type: string, label: string, index: number): NodeKind {
  return {
    type,
    label,
    category: 'key',
    params: [],
    fixedParams: { index },
    ports: roundKeyPorts,
    widths: roundKeyWidths,
    evaluate: roundKeyEvaluate,
  };
}

function sboxPorts(): { in: PortDef[]; out: PortDef[] } {
  return { in: [{ id: 'in', label: 'in' }], out: [{ id: 'out', label: 'out' }] };
}

function sboxWidths({ params, in: inW }: WidthCtx): WidthResult {
  const cw = pInt(params, 'cellWidth', 4);
  const table = pArr(params, 'table', []);
  const w = inW['in'] ?? null;
  let error: string | undefined;
  if (table.length !== 1 << cw) {
    error = `table has ${table.length} entries, a ${cw}-bit cell needs ${1 << cw}`;
  } else if (w !== null && w % cw !== 0) {
    error = `${w} bits does not divide into ${cw}-bit cells`;
  }
  return { in: { in: null }, out: { out: w }, ...(error ? { error } : {}) };
}

function sboxEvaluate({ params, in: ins }: EvalCtx): Record<string, BitVec> {
  const cw = pInt(params, 'cellWidth', 4);
  const table = pArr(params, 'table', []);
  return { out: B.substitute(ins['in']!, table, cw) };
}

export const SPN_SBOX: number[] = [0x9, 0xe, 0x3, 0x6, 0xd, 0x8, 0x1, 0xa, 0xc, 0x0, 0xf, 0x4, 0x7, 0x2, 0xb, 0x5];
export const FEISTEL_SBOX: number[] = [0x5, 0x0, 0x5, 0xa, 0x9, 0x4, 0xb, 0x6, 0x1, 0xe, 0x7, 0xc, 0x3, 0x8, 0xd, 0x2];

function concatPorts(params: Params): { in: PortDef[]; out: PortDef[] } {
  return { in: letterPorts(clampArity(params)), out: [{ id: 'out', label: 'out' }] };
}

function concatWidths({ params, in: inW }: WidthCtx): WidthResult {
  const ports = letterPorts(clampArity(params));
  const inSpec: Record<string, MaybeWidth> = {};
  let total: MaybeWidth = 0;
  for (const p of ports) {
    inSpec[p.id] = null;
    const w = inW[p.id];
    if (w == null) total = null;
    else if (total !== null) total += w;
  }
  return { in: inSpec, out: { out: total } };
}

function concatEvaluate({ params, in: ins }: EvalCtx): Record<string, BitVec> {
  const ports = letterPorts(clampArity(params));
  return { out: B.concat(...ports.map((p) => ins[p.id]!)) };
}

const KINDS: NodeKind[] = [
  {
    type: 'input',
    label: 'Input',
    category: 'io',
    hidden: true,
    params: [],
    ports: () => ({ in: NO_PORTS, out: [{ id: 'out', label: 'out' }] }),
    widths: ({ blockWidth }) => ({ in: {}, out: { out: blockWidth } }),
    evaluate: ({ channels, blockWidth }) => {
      const value = channels['block'];
      if (!value) throw new Error('no value supplied for the block');
      if (value.width !== blockWidth) {
        throw new Error(`block is ${value.width} bits, node expects ${blockWidth}`);
      }
      return { out: value };
    },
  },
  {
    type: 'output',
    label: 'Output',
    category: 'io',
    hidden: true,
    params: [],
    ports: () => ({ in: [{ id: 'in', label: 'in' }], out: NO_PORTS }),
    widths: () => ({ in: { in: null }, out: {} }),
    evaluate: () => ({}),
    emitChannel: ({ in: ins }) => {
      const value = ins['in'];
      return value ? { channel: 'block', value } : null;
    },
  },
  {
    type: 'probe',
    label: 'Probe',
    category: 'io',
    hidden: true,
    params: [],
    ports: () => ({ in: [{ id: 'in', label: 'in' }], out: [{ id: 'out', label: 'out' }] }),
    widths: ({ in: inW }) => ({ in: { in: null }, out: { out: inW['in'] ?? null } }),
    evaluate: ({ in: ins }) => ({ out: ins['in']! }),
  },

  {
    type: 'roundKey',
    label: 'Round key',
    category: 'key',
    hidden: true,
    params: [{ key: 'index', label: 'Round index', kind: 'int', default: 0, min: 0, max: 63 }],
    ports: roundKeyPorts,
    widths: roundKeyWidths,
    evaluate: roundKeyEvaluate,
  },
  fixedRoundKey('roundKey1', 'K1', 0),
  fixedRoundKey('roundKey2', 'K2', 1),
  {
    type: 'const',
    label: 'Constant',
    category: 'key',
    hidden: true,
    params: [
      { key: 'width', label: 'Width', kind: 'int', default: 16, min: 1, max: B.MAX_WIDTH },
      { key: 'value', label: 'Value (hex)', kind: 'hex', default: '0000' },
    ],
    ports: () => ({ in: NO_PORTS, out: [{ id: 'out', label: 'out' }] }),
    widths: ({ params }) => ({ in: {}, out: { out: pInt(params, 'width', 16) } }),
    evaluate: ({ params }) => {
      const w = pInt(params, 'width', 16);
      return { out: B.fromHex(pStr(params, 'value', '0') || '0', w) };
    },
  },

  {
    type: 'split',
    label: 'Split',
    category: 'wiring',
    hidden: true,
    params: [
      {
        key: 'mode',
        label: 'Mode',
        kind: 'enum',
        default: 'at',
        options: [
          { value: 'at', label: 'At bit position' },
          { value: 'equal', label: 'Into equal parts' },
        ],
      },
      { key: 'at', label: 'High part width', kind: 'int', default: 16, min: 0, max: B.MAX_WIDTH },
      { key: 'parts', label: 'Parts', kind: 'int', default: 2, min: 2, max: 16 },
    ],
    ports: (params) => {
      if (pStr(params, 'mode', 'at') === 'equal') {
        const n = Math.min(16, Math.max(2, pInt(params, 'parts', 2)));
        return {
          in: [{ id: 'in', label: 'in' }],
          out: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, label: `p${i}` })),
        };
      }
      return {
        in: [{ id: 'in', label: 'in' }],
        out: [
          { id: 'hi', label: 'hi' },
          { id: 'lo', label: 'lo' },
        ],
      };
    },
    widths: ({ params, in: inW }) => {
      const w = inW['in'] ?? null;
      if (pStr(params, 'mode', 'at') === 'equal') {
        const n = Math.min(16, Math.max(2, pInt(params, 'parts', 2)));
        const out: Record<string, MaybeWidth> = {};
        const each = w === null ? null : w % n === 0 ? w / n : null;
        for (let i = 0; i < n; i++) out[`p${i}`] = each;
        return {
          in: { in: null },
          out,
          ...(w !== null && w % n !== 0 ? { error: `${w} bits does not divide into ${n} parts` } : {}),
        };
      }
      const at = pInt(params, 'at', 16);
      const bad = w !== null && (at > w || at < 0);
      return {
        in: { in: null },
        out: { hi: at, lo: w === null ? null : w - at },
        ...(bad ? { error: `cannot take ${at} high bits from a ${w}-bit wire` } : {}),
      };
    },
    evaluate: ({ params, in: ins }) => {
      const x = ins['in']!;
      if (pStr(params, 'mode', 'at') === 'equal') {
        const n = Math.min(16, Math.max(2, pInt(params, 'parts', 2)));
        const parts = B.splitEqual(x, n);
        return Object.fromEntries(parts.map((p, i) => [`p${i}`, p]));
      }
      const [hi, lo] = B.split(x, pInt(params, 'at', 16));
      return { hi, lo };
    },
  },
  {
    type: 'concat',
    label: 'Concat',
    category: 'wiring',
    hidden: true,
    params: [{ key: 'arity', label: 'Inputs', kind: 'int', default: 2, min: 2, max: 8 }],
    ports: concatPorts,
    widths: concatWidths,
    evaluate: concatEvaluate,
  },
  {
    type: 'splitHalf',
    label: 'Split in half',
    category: 'wiring',
    params: [],
    ports: () => ({
      in: [{ id: 'in', label: 'in' }],
      out: [
        { id: 'hi', label: 'hi' },
        { id: 'lo', label: 'lo' },
      ],
    }),
    widths: ({ in: inW }) => {
      const w = inW['in'] ?? null;
      const half = w === null ? null : w % 2 === 0 ? w / 2 : null;
      return {
        in: { in: null },
        out: { hi: half, lo: half },
        ...(w !== null && w % 2 !== 0 ? { error: `${w} bits does not split into two equal halves` } : {}),
      };
    },
    evaluate: ({ in: ins }) => {
      const x = ins['in']!;
      const [hi, lo] = B.split(x, x.width / 2);
      return { hi, lo };
    },
  },
  {
    type: 'joinHalves',
    label: 'Join',
    category: 'wiring',
    params: [],
    fixedParams: { arity: 2 },
    ports: concatPorts,
    widths: concatWidths,
    evaluate: concatEvaluate,
  },
  {
    type: 'swap',
    label: 'Swap',
    category: 'wiring',
    params: [],
    ports: () => ({
      in: [
        { id: 'a', label: 'a' },
        { id: 'b', label: 'b' },
      ],
      out: [
        { id: 'x', label: 'x = b' },
        { id: 'y', label: 'y = a' },
      ],
    }),
    widths: ({ in: inW }) => ({
      in: { a: null, b: null },
      out: { x: inW['b'] ?? null, y: inW['a'] ?? null },
    }),
    evaluate: ({ in: ins }) => ({ x: ins['b']!, y: ins['a']! }),
  },

  sameWidthKind('xor', 'XOR', 'logic', (vs) => B.xorAll(vs), {
    params: [],
    fixedParams: { arity: 2 },
  }),
  sameWidthKind('and', 'AND', 'logic', (vs) => vs.reduce(B.and)),
  sameWidthKind('or', 'OR', 'logic', (vs) => vs.reduce(B.or)),
  {
    type: 'not',
    label: 'NOT',
    category: 'logic',
    params: [],
    ports: () => ({ in: [{ id: 'in', label: 'in' }], out: [{ id: 'out', label: 'out' }] }),
    widths: ({ in: inW }) => ({ in: { in: null }, out: { out: inW['in'] ?? null } }),
    evaluate: ({ in: ins }) => ({ out: B.not(ins['in']!) }),
  },

  sameWidthKind('addMod', 'Add', 'arith', (vs) => vs.reduce(B.addMod), {
    params: [{ key: 'arity', label: 'Inputs', kind: 'int', default: 2, min: 2, max: 8 }],
    hidden: true,
  }),
  sameWidthKind('subMod', 'Subtract', 'arith', (vs) => vs.reduce(B.subMod), {
    params: [{ key: 'arity', label: 'Inputs', kind: 'int', default: 2, min: 2, max: 8 }],
    hidden: true,
  }),

  {
    type: 'rotate',
    label: 'Rotate',
    category: 'transform',
    params: [
      {
        key: 'dir',
        label: 'Direction',
        kind: 'enum',
        default: 'left',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ],
      },
      { key: 'amount', label: 'Amount', kind: 'int', default: 1, min: 0, max: B.MAX_WIDTH },
    ],
    ports: () => ({ in: [{ id: 'in', label: 'in' }], out: [{ id: 'out', label: 'out' }] }),
    widths: ({ in: inW }) => ({ in: { in: null }, out: { out: inW['in'] ?? null } }),
    evaluate: ({ params, in: ins }) => {
      const n = pInt(params, 'amount', 1);
      const x = ins['in']!;
      return { out: pStr(params, 'dir', 'left') === 'left' ? B.rotl(x, n) : B.rotr(x, n) };
    },
  },
  {
    type: 'shift',
    label: 'Shift',
    category: 'transform',
    hidden: true,
    params: [
      {
        key: 'dir',
        label: 'Direction',
        kind: 'enum',
        default: 'left',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ],
      },
      { key: 'amount', label: 'Amount', kind: 'int', default: 1, min: 0, max: B.MAX_WIDTH },
    ],
    ports: () => ({ in: [{ id: 'in', label: 'in' }], out: [{ id: 'out', label: 'out' }] }),
    widths: ({ in: inW }) => ({ in: { in: null }, out: { out: inW['in'] ?? null } }),
    evaluate: ({ params, in: ins }) => {
      const n = pInt(params, 'amount', 1);
      const x = ins['in']!;
      return { out: pStr(params, 'dir', 'left') === 'left' ? B.shl(x, n) : B.shr(x, n) };
    },
  },
  {
    type: 'permute',
    label: 'Permute',
    category: 'transform',
    params: [
      { key: 'perm', label: 'Table', kind: 'permutation', default: [3, 0, 1, 2] },
      { key: 'invert', label: 'Invert', kind: 'bool', default: false },
    ],
    ports: () => ({ in: [{ id: 'in', label: 'in' }], out: [{ id: 'out', label: 'out' }] }),
    widths: ({ params, in: inW }) => {
      const perm = effectivePerm(params);
      if (!perm) return { in: { in: null }, out: { out: null }, error: 'table is not a permutation, so it cannot be inverted' };
      const w = inW['in'] ?? null;
      const maxIdx = perm.length === 0 ? -1 : Math.max(...perm);
      const bad = w !== null && maxIdx >= w;
      return {
        in: { in: null },
        out: { out: perm.length },
        ...(bad ? { error: `table refers to bit ${maxIdx} of a ${w}-bit wire` } : {}),
      };
    },
    evaluate: ({ params, in: ins }) => {
      const perm = effectivePerm(params);
      if (!perm) throw new Error('table is not a permutation, so it cannot be inverted');
      return { out: B.permute(ins['in']!, perm) };
    },
  },
  {
    type: 'sbox',
    label: 'S-box',
    category: 'transform',
    params: [
      { key: 'cellWidth', label: 'Cell width', kind: 'int', default: 4, min: 1, max: 8 },
      {
        key: 'table',
        label: 'Table',
        kind: 'table',
        default: [0x6, 0x4, 0xc, 0x5, 0x0, 0x7, 0x2, 0xe, 0x1, 0xf, 0x3, 0xd, 0x8, 0xa, 0x9, 0xb],
      },
    ],
    ports: sboxPorts,
    widths: sboxWidths,
    evaluate: sboxEvaluate,
  },
];

function effectivePerm(params: Params): number[] | null {
  const perm = pArr(params, 'perm', []);
  return pBool(params, 'invert', false) ? B.invertTable(perm) : perm;
}

const BY_TYPE = new Map(KINDS.map((k) => [k.type, k]));

export function getKind(type: string): NodeKind | undefined {
  return BY_TYPE.get(type);
}

export const ALL_TYPES: string[] = KINDS.map((k) => k.type);

export function kindsByCategory(): Array<{ category: Category; kinds: NodeKind[] }> {
  const order: Category[] = ['io', 'key', 'wiring', 'logic', 'arith', 'transform'];
  return order
    .map((category) => ({ category, kinds: KINDS.filter((k) => k.category === category && !k.hidden) }))
    .filter((g) => g.kinds.length > 0);
}

export function defaultParams(type: string): Params {
  const kind = getKind(type);
  if (!kind) return {};
  const out: Params = cloneParams(kind.fixedParams ?? {});
  for (const p of kind.params) out[p.key] = Array.isArray(p.default) ? [...p.default] : p.default;
  return out;
}

export function reconcileParams(type: string, params: Params): Params {
  const next = { ...params };
  if (type === 'sbox') {
    const cw = Math.min(8, Math.max(1, pInt(next, 'cellWidth', 4)));
    next['cellWidth'] = cw;
    const want = 1 << cw;
    const table = pArr(next, 'table', []);
    const usable = table.length === want && table.every((v) => Number.isInteger(v) && v >= 0 && v < want);
    if (!usable) next['table'] = resizeToBijection(table, want);
  }
  return next;
}

function resizeToBijection(table: readonly number[], want: number): number[] {
  const out = new Array<number>(want).fill(-1);
  const used = new Set<number>();
  for (let i = 0; i < want; i++) {
    const v = table[i];
    if (v !== undefined && v >= 0 && v < want && !used.has(v)) {
      out[i] = v;
      used.add(v);
    }
  }
  const spare: number[] = [];
  for (let v = 0; v < want; v++) if (!used.has(v)) spare.push(v);
  for (let i = 0; i < want; i++) if (out[i] === -1) out[i] = spare.pop()!;
  return out;
}

export function isLossy(type: string): boolean {
  return type === 'and' || type === 'or' || type === 'shift';
}
