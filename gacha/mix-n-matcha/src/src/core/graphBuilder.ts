import type { EdgeSpec, GraphSpec, NodeSpec, Params } from './graph';
import { edgeIdFor } from './graph';
import { defaultParams } from './nodeKinds';

export interface Ref {
  node: string;
  port: string;
}

export class Builder {
  private readonly nodes: NodeSpec[] = [];
  private readonly edges: EdgeSpec[] = [];

  add(id: string, type: string, params: Params, x: number, y: number, label?: string): string {
    this.nodes.push({ id, type, position: { x, y }, params: { ...defaultParams(type), ...params }, ...(label ? { label } : {}) });
    return id;
  }

  wire(from: Ref, toNode: string, toPort: string): void {
    const e = { source: from.node, sourcePort: from.port, target: toNode, targetPort: toPort };
    this.edges.push({ id: edgeIdFor(e), ...e });
  }

  build(): GraphSpec {
    return { nodes: this.nodes, edges: this.edges };
  }
}

export function playerStartingGraph(): GraphSpec {
  const b = new Builder();
  b.add('in', 'input', {}, 170, 0, 'Ciphertext');
  b.add('out', 'output', {}, 170, 900, 'Plaintext');
  return b.build();
}
