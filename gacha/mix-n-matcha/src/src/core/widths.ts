import { edgeInto, topoSort, type EdgeSpec, type GraphSpec } from './graph';
import { errorDiag, type Diagnostic } from './diagnostics';
import { getKind, type MaybeWidth } from './nodeKinds';

export interface WidthEnv {
  blockWidth: number;
  keyWidths: number[];
}

export interface ResolvedNode {
  in: Record<string, MaybeWidth>;
  out: Record<string, MaybeWidth>;
  error?: string;
}

export interface WidthSolution {
  nodes: Map<string, ResolvedNode>;
  edges: Map<string, MaybeWidth>;
  diagnostics: Diagnostic[];
  cycle: string[];
}

const EMPTY_RESOLVED: ResolvedNode = { in: {}, out: {} };

export function resolveWidths(g: GraphSpec, env: WidthEnv): WidthSolution {
  const nodes = new Map<string, ResolvedNode>();
  const edges = new Map<string, MaybeWidth>();
  const diagnostics: Diagnostic[] = [];

  const { order, cycle } = topoSort(g);
  if (cycle.length > 0) {
    diagnostics.push(errorDiag('circuit contains a feedback loop, so it cannot be evaluated'));
    for (const id of cycle) diagnostics.push(errorDiag('part of a feedback loop', { nodeId: id }));
  }

  const visitOrder = cycle.length > 0 ? g.nodes.map((n) => n.id) : order;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));

  for (const nodeId of visitOrder) {
    const node = byId.get(nodeId);
    if (!node) continue;
    const kind = getKind(node.type);
    if (!kind) {
      nodes.set(nodeId, EMPTY_RESOLVED);
      diagnostics.push(errorDiag(`unknown node type "${node.type}"`, { nodeId }));
      continue;
    }

    const ports = kind.ports(node.params);

    const arriving: Record<string, MaybeWidth> = {};
    for (const p of ports.in) {
      const e = edgeInto(g, nodeId, p.id);
      arriving[p.id] = e ? (nodes.get(e.source)?.out[e.sourcePort] ?? null) : null;
    }

    let resolved: ResolvedNode;
    try {
      resolved = kind.widths({ params: node.params, in: arriving, blockWidth: env.blockWidth, keyWidths: env.keyWidths });
    } catch (err) {
      resolved = { in: {}, out: {}, error: err instanceof Error ? err.message : String(err) };
    }
    nodes.set(nodeId, resolved);

    if (resolved.error) diagnostics.push(errorDiag(resolved.error, { nodeId }));

    for (const p of ports.in) {
      const want = resolved.in[p.id] ?? null;
      const got = arriving[p.id] ?? null;
      if (want !== null && got !== null && want !== got) {
        const e = edgeInto(g, nodeId, p.id);
        diagnostics.push(
          errorDiag(`port "${p.id}" expects ${want} bits but receives ${got}`, {
            nodeId,
            portId: p.id,
            ...(e ? { edgeId: e.id } : {}),
          }),
        );
      }
    }

    for (const e of g.edges) {
      if (e.source === nodeId) edges.set(e.id, resolved.out[e.sourcePort] ?? null);
    }
  }

  return { nodes, edges, diagnostics, cycle };
}

export function outWidth(sol: WidthSolution, nodeId: string, portId: string): MaybeWidth {
  return sol.nodes.get(nodeId)?.out[portId] ?? null;
}

export function inWidth(sol: WidthSolution, nodeId: string, portId: string): MaybeWidth {
  return sol.nodes.get(nodeId)?.in[portId] ?? null;
}

export interface ConnectionRequest {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

export interface ConnectionVerdict {
  ok: boolean;
  reason?: string;
}

export function canConnect(g: GraphSpec, sol: WidthSolution, req: ConnectionRequest): ConnectionVerdict {
  const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
  const src = nodeById.get(req.source);
  const dst = nodeById.get(req.target);
  if (!src || !dst) return { ok: false, reason: 'node not found' };
  if (req.source === req.target) return { ok: false, reason: 'a node cannot feed itself' };

  const srcKind = getKind(src.type);
  const dstKind = getKind(dst.type);
  if (!srcKind || !dstKind) return { ok: false, reason: 'unknown node type' };

  const hasOut = srcKind.ports(src.params).out.some((p) => p.id === req.sourcePort);
  const hasIn = dstKind.ports(dst.params).in.some((p) => p.id === req.targetPort);
  if (!hasOut || !hasIn) return { ok: false, reason: 'port not found' };

  const occupied = edgeInto(g, req.target, req.targetPort);
  if (occupied) return { ok: false, reason: `input "${req.targetPort}" already has a wire` };

  if (wouldCloseLoop(g, req.source, req.target)) {
    return { ok: false, reason: 'that would create a feedback loop' };
  }

  const from = outWidth(sol, req.source, req.sourcePort);
  const want = inWidth(sol, req.target, req.targetPort);
  if (from !== null && want !== null && from !== want) {
    return { ok: false, reason: `${from}-bit output into a ${want}-bit input` };
  }

  return { ok: true };
}

function wouldCloseLoop(g: GraphSpec, source: string, target: string): boolean {
  const outs = new Map<string, string[]>();
  for (const e of g.edges) {
    const list = outs.get(e.source);
    if (list) list.push(e.target);
    else outs.set(e.source, [e.target]);
  }
  const seen = new Set<string>([target]);
  const stack: string[] = [target];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === source) return true;
    for (const next of outs.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

export function invalidEdges(g: GraphSpec, sol: WidthSolution): EdgeSpec[] {
  const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
  return g.edges.filter((e) => {
    const src = nodeById.get(e.source);
    const dst = nodeById.get(e.target);
    if (!src || !dst) return true;
    const srcKind = getKind(src.type);
    const dstKind = getKind(dst.type);
    if (!srcKind || !dstKind) return true;
    if (!srcKind.ports(src.params).out.some((p) => p.id === e.sourcePort)) return true;
    if (!dstKind.ports(dst.params).in.some((p) => p.id === e.targetPort)) return true;
    const from = outWidth(sol, e.source, e.sourcePort);
    const want = inWidth(sol, e.target, e.targetPort);
    return from !== null && want !== null && from !== want;
  });
}
