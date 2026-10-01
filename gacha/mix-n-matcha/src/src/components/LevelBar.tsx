import { LEVELS } from '../core/levels';
import { useStore } from '../state/store';
import s from './LevelBar.module.css';

export function LevelBar(): React.ReactElement {
  const levels = useStore((st) => st.levels);
  const activeLevelIndex = useStore((st) => st.activeLevelIndex);
  const selectLevel = useStore((st) => st.selectLevel);

  return (
    <div className={s.bar}>
      <div className={s.tabs}>
        {levels.map((level, i) => (
          <button
            key={level.id}
            type="button"
            className={`${s.tab} ${i === activeLevelIndex ? s.active : ''}`}
            aria-label={LEVELS[i]?.shortLabel}
            onClick={() => selectLevel(i)}
          >
            <span className={s.tabLabel}>{LEVELS[i]?.shortLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
