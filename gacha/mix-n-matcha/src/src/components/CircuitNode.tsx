import { memo } from 'react';
import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import { getKind } from '../core/nodeKinds';
import { pArr, pInt } from '../core/graph';
import { canEdit, useStore } from '../state/store';
import { inHandle, outHandle, type CircuitNode as CircuitNodeType } from '../state/rf';
import { NodeInspector } from './Inspector';
import s from './CircuitNode.module.css';

const cx = (...parts: Array<string | false | undefined>): string => parts.filter(Boolean).join(' ');

export const CircuitNodeView = memo(function CircuitNodeView({ id, data, selected }: NodeProps<CircuitNodeType>) {
  const kind = getKind(data.kindType);
  const derived = useStore((st) => st.derived[data.paneId]);
  const graph = useStore((st) => st.panes[data.paneId].graph);
  const selection = useStore((st) => st.panes[data.paneId].selection);
  const inspectorVisible =
    selection.nodes.length === 1 && selection.nodes[0] === id && (kind?.params.length ?? 0) > 0;

  if (!kind) {
    return (
      <div className={cx(s.node, s.hasError)}>
        <div className={s.label}>Unknown</div>
        <div className={s.badge}>no node type “{data.kindType}” in the registry</div>
      </div>
    );
  }

  const ports = kind.ports(data.params);
  const problems = derived.evaluation.diagnostics.filter((d) => d.nodeId === id);
  const error = problems.find((d) => d.severity === 'error');
  const warning = problems.find((d) => d.severity === 'warning');
  const unevaluated = derived.evaluation.unevaluated.has(id);

  const connectedIn = new Set(graph.edges.filter((e) => e.target === id).map((e) => e.targetPort));
  const connectedOut = new Set(graph.edges.filter((e) => e.source === id).map((e) => e.sourcePort));
  const badPorts = new Set(problems.filter((d) => d.portId).map((d) => d.portId!));

  const label = data.label ?? (data.kindType === 'roundKey' ? `K${pInt(data.params, 'index', 0)}` : kind.label);

  return (
    <div
      className={cx(
        s.node,
        selected && s.selected,
        error && s.hasError,
        unevaluated && !error && s.faded,
      )}
      style={{ ['--cat' as string]: `var(--cat-${kind.category})` }}
    >
      <NodeToolbar isVisible={inspectorVisible} position={Position.Right} offset={14}>
        <NodeInspector paneId={data.paneId} nodeId={id} editable={canEdit(data.paneId)} />
      </NodeToolbar>

      {ports.in.map((inPort, i) => (
        <Handle
          key={inPort.id}
          type="target"
          position={Position.Top}
          id={inHandle(inPort.id)}
          style={{ left: `${((i + 1) / (ports.in.length + 1)) * 100}%` }}
          className={cx(
            s.handle,
            connectedIn.has(inPort.id) && s.connected,
            badPorts.has(inPort.id) && s.bad,
          )}
        />
      ))}
      {ports.out.map((outPort, i) => (
        <Handle
          key={outPort.id}
          type="source"
          position={Position.Bottom}
          id={outHandle(outPort.id)}
          style={{ left: `${((i + 1) / (ports.out.length + 1)) * 100}%` }}
          className={cx(s.handle, connectedOut.has(outPort.id) && s.connected)}
        />
      ))}

      <div className={s.inner}>
        <div className={s.label}>{label}</div>

        {Array.isArray(data.params['table']) && <SBoxBody params={data.params} />}

        {error ? (
          <span className={s.badge}>{error.message}</span>
        ) : warning ? (
          <span className={cx(s.badge, s.warn)}>{warning.message}</span>
        ) : null}
      </div>
    </div>
  );
});

function SBoxBody({ params }: { params: CircuitNodeTypeParams }): React.ReactElement {
  const cellWidth = pInt(params, 'cellWidth', 4);
  const table = pArr(params, 'table', []);

  if (table.length > 16) {
    return (
      <div className={s.body}>
        <span className={s.tableNote}>{table.length} entries</span>
      </div>
    );
  }

  const digits = Math.ceil(cellWidth / 4);
  return (
    <div className={s.body}>
      <div className={s.tableGrid}>
        {table.map((v, i) => (
          <span className={s.tableCell} key={i}>
            {v.toString(16).padStart(digits, '0')}
          </span>
        ))}
      </div>
    </div>
  );
}

type CircuitNodeTypeParams = CircuitNodeType['data']['params'];
