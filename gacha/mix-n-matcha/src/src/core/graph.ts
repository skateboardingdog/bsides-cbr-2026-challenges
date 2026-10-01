export type ParamValue = number | string | boolean | number[];
export type Params = Record<string, ParamValue>;

export interface NodeSpec {
  id: string;
  type: string;
  position: { x: number; y: number };
  params: Params;
  label?: string;
}

export interface EdgeSpec {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

export interface GraphSpec {
  nodes: NodeSpec[];
  edges: EdgeSpec[];
}

export function emptyGraph(): GraphSpec {
  return { nodes: [], edges: [] };
}

export function cloneGraph(g: GraphSpec): GraphSpec {
  return {
    nodes: g.nodes.map((n) => ({ ...n, position: { ...n.position }, params: cloneParams(n.params) })),
    edges: g.edges.map((e) => ({ ...e })),
  };
}

export function cloneParams(p: Params): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(p)) out[k] = Array.isArray(v) ? [...v] : v;
  return out;
}

let idCounter = 0;

export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36).slice(-4)}${idCounter.toString(36)}`;
}

export function edgeIdFor(e: Omit<EdgeSpec, 'id'>): string {
  return `e_${e.source}.${e.sourcePort}__${e.target}.${e.targetPort}`;
}

export function edgeInto(g: GraphSpec, nodeId: string, portId: string): EdgeSpec | undefined {
  return g.edges.find((e) => e.target === nodeId && e.targetPort === portId);
}

export interface TopoResult {
  order: string[];
  cycle: string[];
}

export function topoSort(g: GraphSpec): TopoResult {
  const indeg = new Map<string, number>();
  const outs = new Map<string, string[]>();
  for (const n of g.nodes) {
    indeg.set(n.id, 0);
    outs.set(n.id, []);
  }
  for (const e of g.edges) {
    if (!indeg.has(e.target) || !indeg.has(e.source)) continue;
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    outs.get(e.source)!.push(e.target);
  }

  const queue = g.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outs.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  const cycle = order.length === g.nodes.length ? [] : g.nodes.map((n) => n.id).filter((id) => !order.includes(id));
  return { order: cycle.length > 0 ? [] : order, cycle };
}

export function pInt(p: Params, key: string, fallback: number): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

export function pStr(p: Params, key: string, fallback: string): string {
  const v = p[key];
  return typeof v === 'string' ? v : fallback;
}

export function pBool(p: Params, key: string, fallback: boolean): boolean {
  const v = p[key];
  return typeof v === 'boolean' ? v : fallback;
}

export function pArr(p: Params, key: string, fallback: number[]): number[] {
  const v = p[key];
  return Array.isArray(v) && v.every((x) => typeof x === 'number') ? v : fallback;
}
