import { useMemo } from 'react';
import { CATEGORY_LABELS, isLossy, kindsByCategory, type NodeKind } from '../core/nodeKinds';
import { useStore } from '../state/store';
import s from './Palette.module.css';

export const PALETTE_MIME = 'application/x-crypto-node';

export function Palette(): React.ReactElement {
  const palette = useStore((st) => st.challenge.palette);
  const activePane = useStore((st) => st.activePane);
  const addNode = useStore((st) => st.addNode);

  const groups = useMemo(() => {
    return kindsByCategory()
      .map(({ category, kinds }) => ({
        category,
        kinds: kinds.filter((k) => palette.includes(k.type)),
      }))
      .filter((g) => g.kinds.length > 0);
  }, [palette]);

  const place = (kind: NodeKind): void => {
    const st = useStore.getState();
    const graph = st.panes[activePane].graph;
    const lowest = graph.nodes.reduce((y, n) => Math.max(y, n.position.y), -80);
    addNode(activePane, kind.type, { x: 40, y: lowest + 90 });
  };

  return (
    <aside className={s.palette}>
      <div className={s.list}>
        {groups.map(({ category, kinds }) => (
          <div className={s.group} key={category}>
            <div className={s.groupTitle}>{CATEGORY_LABELS[category]}</div>
            {kinds.map((kind) => (
              <button
                key={kind.type}
                className={s.chip}
                style={{ ['--cat' as string]: `var(--cat-${kind.category})` }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(PALETTE_MIME, kind.type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => place(kind)}
              >
                <span className={s.chipLabel}>{kind.label}</span>
                {isLossy(kind.type) && (
                  <span className={s.lossy} title="Destroys information — cannot be undone">
                    ⚠
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
