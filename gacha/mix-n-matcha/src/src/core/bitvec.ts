export interface BitVec {
  readonly width: number;
  readonly value: bigint;
}

export const MAX_WIDTH = 4096;

const maskCache = new Map<number, bigint>();

export function widthMask(width: number): bigint {
  let m = maskCache.get(width);
  if (m === undefined) {
    m = (1n << BigInt(width)) - 1n;
    maskCache.set(width, m);
  }
  return m;
}

export class BitVecError extends Error {}

function assertWidth(width: number): void {
  if (!Number.isInteger(width) || width < 0 || width > MAX_WIDTH) {
    throw new BitVecError(`invalid width ${width} (expected integer 0..${MAX_WIDTH})`);
  }
}

export function bv(width: number, value: bigint | number): BitVec {
  assertWidth(width);
  const raw = typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
  return { width, value: raw & widthMask(width) };
}

export function zero(width: number): BitVec {
  return bv(width, 0n);
}

function sameWidth(op: string, a: BitVec, b: BitVec): void {
  if (a.width !== b.width) {
    throw new BitVecError(`${op}: width mismatch (${a.width} vs ${b.width})`);
  }
}

export function xor(a: BitVec, b: BitVec): BitVec {
  sameWidth('xor', a, b);
  return { width: a.width, value: a.value ^ b.value };
}

export function and(a: BitVec, b: BitVec): BitVec {
  sameWidth('and', a, b);
  return { width: a.width, value: a.value & b.value };
}

export function or(a: BitVec, b: BitVec): BitVec {
  sameWidth('or', a, b);
  return { width: a.width, value: a.value | b.value };
}

export function not(a: BitVec): BitVec {
  return { width: a.width, value: ~a.value & widthMask(a.width) };
}

export function xorAll(vs: readonly BitVec[]): BitVec {
  if (vs.length === 0) throw new BitVecError('xorAll: needs at least one operand');
  return vs.reduce((acc, v) => xor(acc, v));
}

export function addMod(a: BitVec, b: BitVec): BitVec {
  sameWidth('addMod', a, b);
  return bv(a.width, a.value + b.value);
}

export function subMod(a: BitVec, b: BitVec): BitVec {
  sameWidth('subMod', a, b);
  return bv(a.width, a.value - b.value);
}

export function split(a: BitVec, hiWidth: number): [BitVec, BitVec] {
  if (!Number.isInteger(hiWidth) || hiWidth < 0 || hiWidth > a.width) {
    throw new BitVecError(`split: hiWidth ${hiWidth} out of range for width ${a.width}`);
  }
  const loWidth = a.width - hiWidth;
  return [bv(hiWidth, a.value >> BigInt(loWidth)), bv(loWidth, a.value)];
}

export function splitEqual(a: BitVec, n: number): BitVec[] {
  if (!Number.isInteger(n) || n <= 0) throw new BitVecError(`splitEqual: bad count ${n}`);
  if (a.width % n !== 0) {
    throw new BitVecError(`splitEqual: width ${a.width} not divisible by ${n}`);
  }
  const each = a.width / n;
  const out: BitVec[] = [];
  for (let i = 0; i < n; i++) {
    out.push(bv(each, a.value >> BigInt((n - 1 - i) * each)));
  }
  return out;
}

export function concat(...parts: BitVec[]): BitVec {
  let width = 0;
  let value = 0n;
  for (const p of parts) {
    value = (value << BigInt(p.width)) | p.value;
    width += p.width;
  }
  assertWidth(width);
  return { width, value };
}

export function rotl(a: BitVec, n: number): BitVec {
  if (a.width === 0) return a;
  const k = ((n % a.width) + a.width) % a.width;
  if (k === 0) return a;
  const kb = BigInt(k);
  const rest = BigInt(a.width - k);
  return { width: a.width, value: ((a.value << kb) | (a.value >> rest)) & widthMask(a.width) };
}

export function rotr(a: BitVec, n: number): BitVec {
  if (a.width === 0) return a;
  return rotl(a, -n);
}

export function shl(a: BitVec, n: number): BitVec {
  if (n < 0) return shr(a, -n);
  if (n >= a.width) return zero(a.width);
  return bv(a.width, a.value << BigInt(n));
}

export function shr(a: BitVec, n: number): BitVec {
  if (n < 0) return shl(a, -n);
  if (n >= a.width) return zero(a.width);
  return { width: a.width, value: a.value >> BigInt(n) };
}

export function permute(a: BitVec, perm: readonly number[]): BitVec {
  let value = 0n;
  for (let i = 0; i < perm.length; i++) {
    const src = perm[i];
    if (src === undefined || src < 0 || src >= a.width) {
      throw new BitVecError(`permute: entry ${i} refers to bit ${src}, width is ${a.width}`);
    }
    value = (value << 1n) | ((a.value >> BigInt(a.width - 1 - src)) & 1n);
  }
  assertWidth(perm.length);
  return { width: perm.length, value };
}

export function substitute(
  a: BitVec,
  table: readonly number[],
  cellWidth: number,
  outCellWidth: number = cellWidth,
): BitVec {
  if (cellWidth <= 0) throw new BitVecError(`substitute: bad cellWidth ${cellWidth}`);
  if (a.width % cellWidth !== 0) {
    throw new BitVecError(`substitute: width ${a.width} not divisible by cell width ${cellWidth}`);
  }
  const expected = 1 << cellWidth;
  if (table.length !== expected) {
    throw new BitVecError(
      `substitute: table has ${table.length} entries, a ${cellWidth}-bit cell needs ${expected}`,
    );
  }
  const cells = a.width / cellWidth;
  const cellMask = widthMask(cellWidth);
  const outMask = widthMask(outCellWidth);
  let value = 0n;
  for (let i = 0; i < cells; i++) {
    const shift = BigInt((cells - 1 - i) * cellWidth);
    const idx = Number((a.value >> shift) & cellMask);
    const mapped = BigInt(table[idx] ?? 0) & outMask;
    value = (value << BigInt(outCellWidth)) | mapped;
  }
  return { width: cells * outCellWidth, value };
}

export function invertTable(table: readonly number[]): number[] | null {
  const out = new Array<number>(table.length).fill(-1);
  for (let i = 0; i < table.length; i++) {
    const v = table[i];
    if (v === undefined || v < 0 || v >= table.length || out[v] !== -1) return null;
    out[v] = i;
  }
  return out.every((v) => v !== -1) ? out : null;
}

export function equals(a: BitVec, b: BitVec): boolean {
  return a.width === b.width && a.value === b.value;
}

export function hexDigits(width: number): number {
  return Math.ceil(width / 4);
}

export function toHex(a: BitVec, prefix = false): string {
  const s = a.value.toString(16).padStart(hexDigits(a.width), '0');
  return prefix ? `0x${s}` : s;
}

export function toBin(a: BitVec): string {
  return a.value.toString(2).padStart(a.width, '0');
}

export function toBinGrouped(a: BitVec, group = 4): string {
  const s = toBin(a);
  const out: string[] = [];
  for (let i = 0; i < s.length; i += group) out.push(s.slice(i, i + group));
  return out.join(' ');
}

export function fromHex(hex: string, width?: number): BitVec {
  const cleaned = hex.trim().replace(/^0x/i, '').replace(/[\s_]/g, '');
  if (cleaned.length === 0) throw new BitVecError('fromHex: empty string');
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) throw new BitVecError(`fromHex: not hex: ${hex}`);
  return bv(width ?? cleaned.length * 4, BigInt(`0x${cleaned}`));
}

export function toBytes(a: BitVec): Uint8Array {
  const n = Math.ceil(a.width / 8);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[n - 1 - i] = Number((a.value >> BigInt(i * 8)) & 0xffn);
  }
  return out;
}

export function toAscii(a: BitVec): string {
  return Array.from(toBytes(a), (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
}

export function toShortHex(a: BitVec, maxDigits = 10): string {
  const s = toHex(a);
  if (s.length <= maxDigits) return s;
  const head = Math.ceil((maxDigits - 1) / 2);
  const tail = Math.floor((maxDigits - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
