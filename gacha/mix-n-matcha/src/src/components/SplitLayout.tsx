import { useCallback, useRef, useState } from 'react';
import s from './SplitLayout.module.css';

export interface SplitLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  initialRatio?: number;
  minRatio?: number;
}

export function SplitLayout({
  left,
  right,
  initialRatio = 0.5,
  minRatio = 0.15,
}: SplitLayoutProps): React.ReactElement {
  const [ratio, setRatio] = useState(initialRatio);
  const [dragging, setDragging] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragging || !container.current) return;
      const rect = container.current.getBoundingClientRect();
      const next = (event.clientX - rect.left) / rect.width;
      setRatio(Math.min(1 - minRatio, Math.max(minRatio, next)));
    },
    [dragging, minRatio],
  );

  return (
    <div
      className={s.split}
      ref={container}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragging(false)}
    >
      <div className={s.side} style={{ flex: `${ratio} 1 0` }}>
        {left}
      </div>
      <div
        className={`${s.divider} ${dragging ? s.dragging : ''}`}
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
        }}
        onDoubleClick={() => setRatio(initialRatio)}
      />
      <div className={s.side} style={{ flex: `${1 - ratio} 1 0` }}>
        {right}
      </div>
    </div>
  );
}
