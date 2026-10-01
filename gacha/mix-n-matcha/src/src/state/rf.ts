import type { Edge, Node } from '@xyflow/react';
import { edgeIdFor, type GraphSpec, type Params } from '../core/graph';

export type PaneId = 'encryption' | 'decryption';

export interface CircuitNodeData extends Record<string, unknown> {
  paneId: PaneId;
  kindType: string;
  params: Params;
  label?: string;
}

export type CircuitNode = Node<CircuitNodeData>;

export const outHandle = (portId: string): string => `o_${portId}`;
export const inHandle = (portId: string): string => `i_${portId}`;

export function portFromHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  return handle.startsWith('o_') || handle.startsWith('i_') ? handle.slice(2) : handle;
}

export function toRfNodes(graph: GraphSpec, paneId: PaneId, editable: boolean): CircuitNode[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: 'circuit',
    position: n.position,
    connectable: editable,
    deletable: editable,
    data: { paneId, kindType: n.type, params: n.params, ...(n.label ? { label: n.label } : {}) },
  }));
}

export interface ValueEdgeData extends Record<string, unknown> {
  paneId: PaneId;
  isFinal: boolean;
}

export function toRfEdges(graph: GraphSpec, paneId: PaneId, editable: boolean): Edge<ValueEdgeData>[] {
  const kindById = new Map(graph.nodes.map((n) => [n.id, n.type]));
  return graph.edges.map((e) => ({
    id: e.id,
    type: 'value',
    source: e.source,
    target: e.target,
    sourceHandle: outHandle(e.sourcePort),
    targetHandle: inHandle(e.targetPort),
    deletable: editable,
    reconnectable: editable,
    data: { paneId, isFinal: kindById.get(e.target) === 'output' },
  }));
}

export function makeEdge(
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
): GraphSpec['edges'][number] {
  const e = { source, sourcePort, target, targetPort };
  return { id: edgeIdFor(e), ...e };
}
