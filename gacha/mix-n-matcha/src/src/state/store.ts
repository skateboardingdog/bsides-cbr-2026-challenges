import { create } from 'zustand';
import * as B from './../core/bitvec';
import { ciphertextOf, keyScheduleOf, type Challenge } from '../core/challenge';
import { evaluateGraph, runCircuit, type EvalEnv, type EvalResult } from '../core/evaluate';
import { cloneGraph, emptyGraph, newId, type EdgeSpec, type GraphSpec, type Params } from '../core/graph';
import { defaultParams, getKind, reconcileParams } from '../core/nodeKinds';
import { buildLevelChallenges } from '../core/levels';
import { canConnect, invalidEdges, resolveWidths, type WidthSolution } from '../core/widths';
import { makeEdge, type PaneId } from './rf';
import {
  debounce,
  loadFragments,
  loadPrefs,
  loadProgress,
  loadSolution,
  saveFragments,
  savePrefs,
  saveProgress,
  saveSolution,
} from './persist';

const HISTORY_LIMIT = 100;

export interface Selection {
  nodes: string[];
  edges: string[];
}

export interface PaneState {
  graph: GraphSpec;
  past: GraphSpec[];
  future: GraphSpec[];
  selection: Selection;
  revision: number;
}

export interface PaneDerived {
  evaluation: EvalResult;
  widths: WidthSolution;
}

export interface AppState {
  challenge: Challenge;
  levels: Challenge[];
  activeLevelIndex: number;
  solvedLevels: boolean[];
  solvedFragments: (string | null)[];
  panes: Record<PaneId, PaneState>;
  derived: Record<PaneId, PaneDerived>;
  showValues: boolean;
  activePane: PaneId;
  clipboard: GraphSpec | null;
  notice: string | null;

  setChallenge(challenge: Challenge): void;
  selectLevel(index: number): void;

  addNode(pane: PaneId, type: string, position: { x: number; y: number }): string | null;
  connect(pane: PaneId, source: string, sourcePort: string, target: string, targetPort: string): boolean;
  removeElements(pane: PaneId, nodeIds: readonly string[], edgeIds: readonly string[]): void;
  updateParams(pane: PaneId, nodeId: string, params: Params): void;
  updateLabel(pane: PaneId, nodeId: string, label: string): void;
  movePositions(pane: PaneId, moves: ReadonlyArray<{ id: string; position: { x: number; y: number } }>): void;
  beginDrag(pane: PaneId): void;
  pasteGraph(pane: PaneId, clip: GraphSpec, offset: { x: number; y: number }): void;

  setSelection(pane: PaneId, selection: Selection): void;
  setClipboard(graph: GraphSpec | null): void;
  setActivePane(pane: PaneId): void;

  undo(pane: PaneId): void;
  redo(pane: PaneId): void;

  setShowValues(on: boolean): void;
  setNotice(notice: string | null): void;
}

export function envFor(challenge: Challenge, pane: PaneId): EvalEnv {
  const keySchedule = keyScheduleOf(challenge);
  const blockWidth = challenge.blockWidth;
  if (pane === 'encryption') {
    return { blockWidth, keySchedule, channels: { block: B.zero(blockWidth) } };
  }
  const ct = ciphertextOf(challenge);
  return { blockWidth, keySchedule, channels: ct ? { block: ct } : {} };
}

export function derive(challenge: Challenge, graph: GraphSpec, pane: PaneId): PaneDerived {
  const evaluation = evaluateGraph(graph, envFor(challenge, pane));
  return { evaluation, widths: evaluation.widths };
}

function makePane(graph: GraphSpec, revision = 0): PaneState {
  return { graph, past: [], future: [], selection: { nodes: [], edges: [] }, revision };
}

export function isSolved(challenge: Challenge, evaluation: EvalResult): boolean {
  const candidate = evaluation.outputs['block'];
  if (!candidate) return false;
  const ct = ciphertextOf(challenge);
  if (!ct) return false;
  try {
    const reEncrypted = runCircuit(challenge.encryption, {
      blockWidth: challenge.blockWidth,
      keySchedule: keyScheduleOf(challenge),
      channels: { block: candidate },
    });
    return B.equals(reEncrypted, ct);
  } catch {
    return false;
  }
}

export function maybeSolve(
  state: Pick<AppState, 'challenge' | 'levels' | 'activeLevelIndex' | 'solvedLevels' | 'solvedFragments'>,
  evaluation: EvalResult,
): { solvedLevels: boolean[]; solvedFragments: (string | null)[] } | null {
  const isActiveLevel = state.challenge.id === state.levels[state.activeLevelIndex]?.id;
  if (!isActiveLevel || state.solvedLevels[state.activeLevelIndex]) return null;
  if (!isSolved(state.challenge, evaluation)) return null;
  const fragmentHex = B.toHex(evaluation.outputs['block']!);
  const solvedLevels = state.solvedLevels.map((v, i) => (i === state.activeLevelIndex ? true : v));
  const solvedFragments = state.solvedFragments.map((v, i) => (i === state.activeLevelIndex ? fragmentHex : v));
  saveProgress(state.levels.filter((_, i) => solvedLevels[i]).map((c) => c.id));
  saveFragments(
    Object.fromEntries(
      state.levels
        .map((c, i) => [c.id, solvedFragments[i]] as const)
        .filter((entry): entry is [string, string] => entry[1] != null),
    ),
  );
  return { solvedLevels, solvedFragments };
}

export function valuesVisible(state: Pick<AppState, 'showValues' | 'challenge'>, paneId: PaneId): boolean {
  if (paneId === 'encryption') return false;
  if (!state.showValues) return false;
  return state.challenge.showLiveValues;
}

const persistSolution = debounce(saveSolution, 400);
const persistPrefs = debounce(savePrefs, 300);

function initialSolution(challenge: Challenge): GraphSpec {
  const saved = loadSolution(challenge.id);
  if (saved) return saved;
  return challenge.startingGraph ? cloneGraph(challenge.startingGraph) : emptyGraph();
}

function initialLevelIndex(levels: Challenge[], solvedIds: string[]): number {
  const firstUnsolved = levels.findIndex((c) => !solvedIds.includes(c.id));
  return firstUnsolved === -1 ? levels.length - 1 : firstUnsolved;
}

export const useStore = create<AppState>()((set, get) => {
  const levels = buildLevelChallenges();
  const solvedIds = loadProgress();
  const activeLevelIndex = initialLevelIndex(levels, solvedIds);
  const challenge = levels[activeLevelIndex]!;
  const solvedLevels = levels.map((c) => solvedIds.includes(c.id));
  const fragmentsById = loadFragments();
  const solvedFragments = levels.map((c) => fragmentsById[c.id] ?? null);
  const prefs = loadPrefs();
  const encryption = cloneGraph(challenge.encryption);
  const decryption = initialSolution(challenge);
  const encryptionDerived0 = derive(challenge, encryption, 'encryption');
  const decryptionDerived0 = derive(challenge, decryption, 'decryption');
  const solved0 = maybeSolve({ challenge, levels, activeLevelIndex, solvedLevels, solvedFragments }, decryptionDerived0.evaluation);
  const solvedLevels0 = solved0?.solvedLevels ?? solvedLevels;
  const solvedFragments0 = solved0?.solvedFragments ?? solvedFragments;

  function commit(pane: PaneId, mutate: (graph: GraphSpec) => GraphSpec | null): void {
    const state = get();
    const current = state.panes[pane];
    const next = mutate(current.graph);
    if (!next) return;

    const past = [...current.past, cloneGraph(current.graph)].slice(-HISTORY_LIMIT);
    const nextDerived = derive(state.challenge, next, pane);
    const solved = pane === 'decryption' ? maybeSolve(state, nextDerived.evaluation) : null;
    set({
      panes: {
        ...state.panes,
        [pane]: { ...current, graph: next, past, future: [], revision: current.revision + 1 },
      },
      derived: { ...state.derived, [pane]: nextDerived },
      ...(solved ? { solvedLevels: solved.solvedLevels, solvedFragments: solved.solvedFragments } : {}),
    });
    afterChange(pane);
  }

  function afterChange(pane: PaneId): void {
    if (pane === 'decryption') {
      const state = get();
      persistSolution(state.challenge.id, state.panes.decryption.graph);
    }
  }

  return {
    challenge,
    levels,
    activeLevelIndex,
    solvedLevels: solvedLevels0,
    solvedFragments: solvedFragments0,
    panes: { encryption: makePane(encryption), decryption: makePane(decryption) },
    derived: { encryption: encryptionDerived0, decryption: decryptionDerived0 },
    showValues: prefs.showValues ?? true,
    activePane: 'decryption',
    clipboard: null,
    notice: null,

    setChallenge(next) {
      const state = get();
      const enc = cloneGraph(next.encryption);
      const dec = loadSolution(next.id) ?? (next.startingGraph ? cloneGraph(next.startingGraph) : emptyGraph());
      const encDerived = derive(next, enc, 'encryption');
      const decDerived = derive(next, dec, 'decryption');
      const solved = maybeSolve({ ...state, challenge: next }, decDerived.evaluation);
      set({
        challenge: next,
        panes: {
          encryption: makePane(enc, state.panes.encryption.revision + 1),
          decryption: makePane(dec, state.panes.decryption.revision + 1),
        },
        derived: { encryption: encDerived, decryption: decDerived },
        solvedLevels: solved?.solvedLevels ?? state.solvedLevels,
        solvedFragments: solved?.solvedFragments ?? state.solvedFragments,
      });
    },

    selectLevel(index) {
      const state = get();
      if (index < 0 || index >= state.levels.length || index === state.activeLevelIndex) return;
      set({ activeLevelIndex: index });
      get().setChallenge(state.levels[index]!);
    },

    addNode(pane, type, position) {
      const kind = getKind(type);
      if (!kind) return null;
      const state = get();
      if (!canEdit(pane)) return null;
      if (!isAllowed(state, type)) return null;

      const id = newId(type);
      commit(pane, (graph) => ({
        ...graph,
        nodes: [...graph.nodes, { id, type, position, params: defaultParams(type) }],
      }));
      return id;
    },

    connect(pane, source, sourcePort, target, targetPort) {
      if (!canEdit(pane)) return false;
      const state = get();
      const graph = state.panes[pane].graph;
      const verdict = canConnect(graph, state.derived[pane].widths, { source, sourcePort, target, targetPort });
      if (!verdict.ok) {
        set({ notice: verdict.reason ?? 'connection refused' });
        return false;
      }
      commit(pane, (g) => ({ ...g, edges: [...g.edges, makeEdge(source, sourcePort, target, targetPort)] }));
      return true;
    },

    removeElements(pane, nodeIds, edgeIds) {
      if (nodeIds.length === 0 && edgeIds.length === 0) return;
      const dropNodes = new Set(nodeIds);
      const dropEdges = new Set(edgeIds);
      commit(pane, (graph) => ({
        nodes: graph.nodes.filter((n) => !dropNodes.has(n.id)),
        edges: graph.edges.filter(
          (e) => !dropEdges.has(e.id) && !dropNodes.has(e.source) && !dropNodes.has(e.target),
        ),
      }));
    },

    updateParams(pane, nodeId, params) {
      commit(pane, (graph) => {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) return null;
        const reconciled = reconcileParams(node.type, params);
        const nextGraph: GraphSpec = {
          ...graph,
          nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, params: reconciled } : n)),
        };
        const sol = resolveWidths(nextGraph, {
          blockWidth: get().challenge.blockWidth,
          keyWidths: keyScheduleOf(get().challenge).map((k) => k.width),
        });
        const stale = new Set(invalidEdges(nextGraph, sol).map((e: EdgeSpec) => e.id));
        if (stale.size === 0) return nextGraph;
        set({ notice: `Removed ${stale.size} wire${stale.size === 1 ? '' : 's'} that no longer fit.` });
        return { ...nextGraph, edges: nextGraph.edges.filter((e) => !stale.has(e.id)) };
      });
    },

    updateLabel(pane, nodeId, label) {
      commit(pane, (graph) => ({
        ...graph,
        nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, label: label || undefined } : n)),
      }));
    },

    movePositions(pane, moves) {
      if (moves.length === 0) return;
      const state = get();
      const current = state.panes[pane];
      const byId = new Map(moves.map((m) => [m.id, m.position]));
      const graph: GraphSpec = {
        ...current.graph,
        nodes: current.graph.nodes.map((n) => {
          const p = byId.get(n.id);
          return p ? { ...n, position: p } : n;
        }),
      };
      set({ panes: { ...state.panes, [pane]: { ...current, graph } } });
    },

    beginDrag(pane) {
      const state = get();
      const current = state.panes[pane];
      const past = [...current.past, cloneGraph(current.graph)].slice(-HISTORY_LIMIT);
      set({ panes: { ...state.panes, [pane]: { ...current, past, future: [] } } });
    },

    pasteGraph(pane, clip, offset) {
      const state = get();
      if (!canEdit(pane)) return;
      const allowed = clip.nodes.filter((n) => isAllowed(state, n.type));
      if (allowed.length === 0) {
        set({ notice: 'Nothing on the clipboard can be placed here.' });
        return;
      }

      const idMap = new Map<string, string>();
      for (const n of allowed) idMap.set(n.id, newId(n.type));

      const nodes = allowed.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
        params: { ...n.params },
      }));
      const edges = clip.edges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => makeEdge(idMap.get(e.source)!, e.sourcePort, idMap.get(e.target)!, e.targetPort));

      commit(pane, (graph) => ({ nodes: [...graph.nodes, ...nodes], edges: [...graph.edges, ...edges] }));
      set((s) => ({
        panes: {
          ...s.panes,
          [pane]: { ...s.panes[pane], selection: { nodes: nodes.map((n) => n.id), edges: edges.map((e) => e.id) } },
        },
      }));
    },

    setSelection(pane, selection) {
      const state = get();
      set({ panes: { ...state.panes, [pane]: { ...state.panes[pane], selection } } });
    },

    setClipboard(graph) {
      set({ clipboard: graph });
    },

    setActivePane(pane) {
      if (get().activePane !== pane) set({ activePane: pane });
    },

    undo(pane) {
      const state = get();
      const current = state.panes[pane];
      const previous = current.past.at(-1);
      if (!previous) return;
      const next: PaneState = {
        ...current,
        graph: previous,
        past: current.past.slice(0, -1),
        future: [cloneGraph(current.graph), ...current.future].slice(0, HISTORY_LIMIT),
        revision: current.revision + 1,
      };
      const nextDerived = derive(state.challenge, previous, pane);
      const solved = pane === 'decryption' ? maybeSolve(state, nextDerived.evaluation) : null;
      set({
        panes: { ...state.panes, [pane]: next },
        derived: { ...state.derived, [pane]: nextDerived },
        ...(solved ? { solvedLevels: solved.solvedLevels, solvedFragments: solved.solvedFragments } : {}),
      });
      afterChange(pane);
    },

    redo(pane) {
      const state = get();
      const current = state.panes[pane];
      const upcoming = current.future[0];
      if (!upcoming) return;
      const next: PaneState = {
        ...current,
        graph: upcoming,
        past: [...current.past, cloneGraph(current.graph)].slice(-HISTORY_LIMIT),
        future: current.future.slice(1),
        revision: current.revision + 1,
      };
      const nextDerived = derive(state.challenge, upcoming, pane);
      const solved = pane === 'decryption' ? maybeSolve(state, nextDerived.evaluation) : null;
      set({
        panes: { ...state.panes, [pane]: next },
        derived: { ...state.derived, [pane]: nextDerived },
        ...(solved ? { solvedLevels: solved.solvedLevels, solvedFragments: solved.solvedFragments } : {}),
      });
      afterChange(pane);
    },

    setShowValues(on) {
      set({ showValues: on });
      persistPrefs({ showValues: on });
    },

    setNotice(notice) {
      set({ notice });
    },
  };
});

export function canEdit(pane: PaneId): boolean {
  return pane === 'decryption';
}

export function isAllowed(state: Pick<AppState, 'challenge'>, type: string): boolean {
  return state.challenge.palette.includes(type);
}
