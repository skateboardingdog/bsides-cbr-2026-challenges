import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import { getKind } from '../core/nodeKinds';
import { canConnect } from '../core/widths';
import { useStore } from '../state/store';
import {
  portFromHandle,
  toRfEdges,
  toRfNodes,
  type CircuitNode,
  type PaneId,
  type ValueEdgeData,
} from '../state/rf';
import { CircuitNodeView } from './CircuitNode';
import { ValueEdge } from './ValueEdge';
import { PALETTE_MIME } from './Palette';
import s from './CircuitPane.module.css';

const nodeTypes = { circuit: CircuitNodeView };
const edgeTypes = { value: ValueEdge };
const SNAP: [number, number] = [10, 10];

export interface CircuitPaneProps {
  paneId: PaneId;
  title: string;
  editable: boolean;
}

export function CircuitPane(props: CircuitPaneProps): React.ReactElement {
  return (
    <ReactFlowProvider>
      <PaneInner {...props} />
    </ReactFlowProvider>
  );
}

function PaneInner({ paneId, title, editable }: CircuitPaneProps): React.ReactElement {
  const graph = useStore((st) => st.panes[paneId].graph);
  const revision = useStore((st) => st.panes[paneId].revision);
  const isActive = useStore((st) => st.activePane === paneId);
  const { screenToFlowPosition, getNodes } = useReactFlow<CircuitNode, Edge<ValueEdgeData>>();

  const [nodes, setNodes] = useState<CircuitNode[]>(() => toRfNodes(graph, paneId, editable));
  const [edges, setEdges] = useState<Edge<ValueEdgeData>[]>(() => toRfEdges(graph, paneId, editable));
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    const selected = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    setNodes(toRfNodes(graph, paneId, editable).map((n) => (selected.has(n.id) ? { ...n, selected: true } : n)));
    setEdges(toRfEdges(graph, paneId, editable));
  }, [revision, editable, paneId]);

  const onNodesChange = useCallback((changes: NodeChange<CircuitNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge<ValueEdgeData>>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourcePort = portFromHandle(connection.sourceHandle);
      const targetPort = portFromHandle(connection.targetHandle);
      if (!connection.source || !connection.target || !sourcePort || !targetPort) return false;
      const st = useStore.getState();
      return canConnect(st.panes[paneId].graph, st.derived[paneId].widths, {
        source: connection.source,
        sourcePort,
        target: connection.target,
        targetPort,
      }).ok;
    },
    [paneId],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourcePort = portFromHandle(connection.sourceHandle);
      const targetPort = portFromHandle(connection.targetHandle);
      if (!connection.source || !connection.target || !sourcePort || !targetPort) return;
      useStore.getState().connect(paneId, connection.source, sourcePort, connection.target, targetPort);
    },
    [paneId],
  );

  const onNodesDelete = useCallback(
    (deleted: CircuitNode[]) => {
      useStore.getState().removeElements(paneId, deleted.map((n) => n.id), []);
    },
    [paneId],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      useStore.getState().removeElements(paneId, [], deleted.map((e) => e.id));
    },
    [paneId],
  );

  const pushPositions = useCallback(() => {
    useStore.getState().movePositions(paneId, getNodes().map((n) => ({ id: n.id, position: n.position })));
  }, [getNodes, paneId]);

  const beginDrag = useCallback(() => {
    useStore.getState().beginDrag(paneId);
  }, [paneId]);

  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams) => {
      useStore.getState().setSelection(paneId, {
        nodes: selNodes.map((n) => n.id),
        edges: selEdges.map((e) => e.id),
      });
    },
    [paneId],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!editable) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropping(true);
    },
    [editable],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDropping(false);
      if (!editable) return;
      const type = event.dataTransfer.getData(PALETTE_MIME);
      if (!type || !getKind(type)) return;
      const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const store = useStore.getState();
      const position = { x: Math.round((at.x - 60) / 10) * 10, y: Math.round((at.y - 16) / 10) * 10 };
      if (!store.addNode(paneId, type, position)) {
        store.setNotice(`“${getKind(type)?.label}” is not available in this challenge.`);
      }
    },
    [editable, paneId, screenToFlowPosition],
  );

  const activate = useCallback(() => {
    useStore.getState().setActivePane(paneId);
  }, [paneId]);

  return (
    <div className={s.pane} onPointerDownCapture={activate}>
      <div className={`${s.header} ${isActive ? s.active : ''}`}>
        <span className={s.title}>{title}</span>
      </div>

      <div
        className={`${s.canvas} ${dropping ? s.dropping : ''}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        <ReactFlow<CircuitNode, Edge<ValueEdgeData>>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onNodeDragStart={beginDrag}
          onNodeDragStop={pushPositions}
          onSelectionDragStart={beginDrag}
          onSelectionDragStop={pushPositions}
          onSelectionChange={onSelectionChange}
          isValidConnection={isValidConnection}
          nodesDraggable
          nodesConnectable={editable}
          elementsSelectable
          deleteKeyCode={editable ? ['Delete', 'Backspace'] : null}
          multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
          selectionOnDrag
          panOnDrag={[1, 2]}
          selectionKeyCode={null}
          panOnScroll
          zoomOnDoubleClick={false}
          snapToGrid
          snapGrid={SNAP}
          minZoom={0.2}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
          proOptions={{ hideAttribution: false }}
        />
      </div>
    </div>
  );
}
