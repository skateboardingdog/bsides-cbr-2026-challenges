import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps, type Edge } from '@xyflow/react';
import * as B from '../core/bitvec';
import { useStore, valuesVisible } from '../state/store';
import type { ValueEdgeData } from '../state/rf';
import s from './ValueEdge.module.css';

export const ValueEdge = memo(function ValueEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<Edge<ValueEdgeData>>) {
  const paneId = data?.paneId ?? 'decryption';

  const value = useStore((st) => st.derived[paneId].evaluation.values.get(id));
  const visible = useStore((st) => valuesVisible(st, paneId));
  const isDecryptedOutput = paneId === 'decryption' && (data?.isFinal ?? false);

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
  });

  return (
    <>
      <BaseEdge id={id} path={path} />
      {visible && value && (
        <EdgeLabelRenderer>
          <div
            className={`${s.chip} ${isDecryptedOutput ? s.decrypted : ''} ${selected ? s.selected : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {isDecryptedOutput ? (
              <>
                <span className={s.ascii}>{B.toAscii(value)}</span>
                <span className={s.hex}>{B.toShortHex(value)}</span>
              </>
            ) : (
              B.toShortHex(value)
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
