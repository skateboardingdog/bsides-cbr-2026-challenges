import type { GraphSpec } from '../core/graph';

const PREFIX = 'csc.v1';
const solutionKey = (challengeId: string): string => `${PREFIX}.solution.${challengeId}`;
const PREFS_KEY = `${PREFIX}.prefs`;
const PROGRESS_KEY = `${PREFIX}.progress`;
const FRAGMENTS_KEY = `${PREFIX}.fragments`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function loadSolution(challengeId: string): GraphSpec | null {
  const raw = read(solutionKey(challengeId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GraphSpec;
    return Array.isArray(parsed.nodes) && Array.isArray(parsed.edges) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSolution(challengeId: string, graph: GraphSpec): void {
  write(solutionKey(challengeId), JSON.stringify(graph));
}

export function loadProgress(): string[] {
  const raw = read(PROGRESS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProgress(solvedIds: readonly string[]): void {
  write(PROGRESS_KEY, JSON.stringify(solvedIds));
}

export function loadFragments(): Record<string, string> {
  const raw = read(FRAGMENTS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, hex] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof hex === 'string') out[id] = hex;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFragments(fragments: Readonly<Record<string, string>>): void {
  write(FRAGMENTS_KEY, JSON.stringify(fragments));
}

export interface Prefs {
  showValues: boolean;
}

export function loadPrefs(): Partial<Prefs> {
  const raw = read(PREFS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Prefs>;
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Prefs): void {
  write(PREFS_KEY, JSON.stringify(prefs));
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
