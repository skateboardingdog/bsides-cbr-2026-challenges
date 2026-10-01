import { useCallback, useEffect, useRef } from 'react';
import { cloneGraph, type GraphSpec } from '../core/graph';
import { canEdit, useStore, type AppState } from './store';
import type { PaneId } from './rf';

const CLIP_MARKER = 'client-side-crypto/graph@1';
const PASTE_STEP = 24;

interface ClipboardPayload {
  kind: typeof CLIP_MARKER;
  graph: GraphSpec;
}

export const paneEditable = canEdit;

function selectionAsGraph(state: AppState, pane: PaneId): GraphSpec | null {
  const { graph, selection } = state.panes[pane];
  const ids = new Set(selection.nodes);
  if (ids.size === 0) return null;
  return {
    nodes: graph.nodes.filter((n) => ids.has(n.id)).map((n) => ({ ...n, params: { ...n.params } })),
    edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useEditorShortcuts(): void {
  const pasteCount = useRef(0);

  const copy = useCallback(async (): Promise<GraphSpec | null> => {
    const state = useStore.getState();
    const clip = selectionAsGraph(state, state.activePane);
    if (!clip) return null;
    state.setClipboard(clip);
    pasteCount.current = 0;
    try {
      const payload: ClipboardPayload = { kind: CLIP_MARKER, graph: clip };
      await navigator.clipboard.writeText(JSON.stringify(payload));
    } catch {}
    return clip;
  }, []);

  const readClipboard = useCallback(async (): Promise<GraphSpec | null> => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text) as Partial<ClipboardPayload>;
      if (parsed.kind === CLIP_MARKER && parsed.graph) return parsed.graph;
    } catch {}
    return useStore.getState().clipboard;
  }, []);

  const paste = useCallback(async (): Promise<void> => {
    const state = useStore.getState();
    const pane = state.activePane;
    if (!paneEditable(pane)) return;
    const clip = await readClipboard();
    if (!clip || clip.nodes.length === 0) return;
    pasteCount.current += 1;
    const step = PASTE_STEP * pasteCount.current;
    state.pasteGraph(pane, clip, { x: step, y: step });
  }, [readClipboard]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const state = useStore.getState();
      const pane = state.activePane;
      const editable = paneEditable(pane);
      const key = event.key.toLowerCase();

      switch (key) {
        case 'c': {
          event.preventDefault();
          if (!editable) return;
          void copy();
          break;
        }
        case 'x': {
          if (!editable) return;
          const selection = state.panes[pane].selection;
          void copy().then((clip) => {
            if (clip) state.removeElements(pane, selection.nodes, selection.edges);
          });
          event.preventDefault();
          break;
        }
        case 'v': {
          void paste();
          event.preventDefault();
          break;
        }
        case 'd': {
          if (!editable) return;
          const clip = selectionAsGraph(state, pane);
          if (clip) state.pasteGraph(pane, cloneGraph(clip), { x: PASTE_STEP, y: PASTE_STEP });
          event.preventDefault();
          break;
        }
        case 'z': {
          if (!editable) return;
          if (event.shiftKey) state.redo(pane);
          else state.undo(pane);
          event.preventDefault();
          break;
        }
        case 'y': {
          if (!editable) return;
          state.redo(pane);
          event.preventDefault();
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copy, paste]);
}
