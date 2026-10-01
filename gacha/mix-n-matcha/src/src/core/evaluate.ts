import type { BitVec } from './bitvec';
import { edgeInto, topoSort, type GraphSpec } from './graph';
import { errorDiag, warnDiag, type Diagnostic } from './diagnostics';
import { getKind } from './nodeKinds';
import { resolveWidths, type WidthSolution } from './widths';

export interface EvalEnv {
  blockWidth: number;
  keySchedule: BitVec[];
  channels: Record<string, BitVec>;
}

export interface EvalResult {
  values: Map<string, BitVec>;
  nodeOutputs: Map<string, Record<string, BitVec>>;
  outputs: Record<string, BitVec>;
  unevaluated: Set<string>;
  diagnostics: Diagnostic[];
  widths: WidthSolution;
  ok: boolean;
}

export function evaluateGraph(g: GraphSpec, env: EvalEnv): EvalResult {
  const widths = resolveWidths(g, {
    blockWidth: env.blockWidth,
    keyWidths: env.keySchedule.map((k) => k.width),
  });

  const values = new Map<string, BitVec>();
  const nodeOutputs = new Map<string, Record<string, BitVec>>();
  const outputs: Record<string, BitVec> = {};
  const unevaluated = new Set<string>();
  const diagnostics: Diagnostic[] = [...widths.diagnostics];

  if (widths.cycle.length > 0) {
    return { values, nodeOutputs, outputs, unevaluated: new Set(widths.cycle), diagnostics, widths, ok: false };
  }

  const { order } = topoSort(g);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));

  for (const nodeId of order) {
    const node = byId.get(nodeId);
    if (!node) continue;
    const kind = getKind(node.type);
    if (!kind) {
      unevaluated.add(nodeId);
      continue;
    }

    const ports = kind.ports(node.params);
    const ins: Record<string, BitVec> = {};
    let ready = true;

    for (const p of ports.in) {
      const edge = edgeInto(g, nodeId, p.id);
      if (!edge) {
        diagnostics.push(warnDiag(`input "${p.id}" is not connected`, { nodeId, portId: p.id }));
        ready = false;
        continue;
      }
      if (unevaluated.has(edge.source)) {
        ready = false;
        continue;
      }
      const v = nodeOutputs.get(edge.source)?.[edge.sourcePort];
      if (!v) {
        ready = false;
        continue;
      }
      ins[p.id] = v;
    }

    if (!ready) {
      unevaluated.add(nodeId);
      continue;
    }

    const ctx = {
      params: node.params,
      in: ins,
      blockWidth: env.blockWidth,
      keySchedule: env.keySchedule,
      channels: env.channels,
    };

    let produced: Record<string, BitVec>;
    try {
      produced = kind.evaluate(ctx);
    } catch (err) {
      diagnostics.push(errorDiag(err instanceof Error ? err.message : String(err), { nodeId }));
      unevaluated.add(nodeId);
      continue;
    }

    nodeOutputs.set(nodeId, produced);

    for (const e of g.edges) {
      if (e.source !== nodeId) continue;
      const v = produced[e.sourcePort];
      if (v) values.set(e.id, v);
    }

    if (kind.emitChannel) {
      try {
        const emitted = kind.emitChannel(ctx);
        if (emitted) {
          if (outputs[emitted.channel]) {
            diagnostics.push(errorDiag(`channel "${emitted.channel}" is driven by more than one output`, { nodeId }));
          }
          outputs[emitted.channel] = emitted.value;
        }
      } catch (err) {
        diagnostics.push(errorDiag(err instanceof Error ? err.message : String(err), { nodeId }));
      }
    }
  }

  const ok = !diagnostics.some((d) => d.severity === 'error');
  return { values, nodeOutputs, outputs, unevaluated, diagnostics, widths, ok };
}

export class CircuitError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message);
    this.diagnostics = diagnostics;
  }
}

export function runCircuit(g: GraphSpec, env: EvalEnv, channel = 'block'): BitVec {
  const result = evaluateGraph(g, env);
  const out = result.outputs[channel];
  if (!out) {
    const why = result.diagnostics.find((d) => d.severity === 'error') ?? result.diagnostics[0];
    throw new CircuitError(
      why ? why.message : `circuit produced no value on channel "${channel}"`,
      result.diagnostics,
    );
  }
  if (!result.ok) {
    const err = result.diagnostics.find((d) => d.severity === 'error')!;
    throw new CircuitError(err.message, result.diagnostics);
  }
  return out;
}
