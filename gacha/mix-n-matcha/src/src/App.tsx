import { useEffect } from 'react';
import { CircuitPane } from './components/CircuitPane';
import { LevelBar } from './components/LevelBar';
import { Palette } from './components/Palette';
import { SplitLayout } from './components/SplitLayout';
import { useStore } from './state/store';
import { useEditorShortcuts } from './state/useEditorShortcuts';
import s from './App.module.css';

export function App(): React.ReactElement {
  const notice = useStore((st) => st.notice);
  const setNotice = useStore((st) => st.setNotice);

  useEditorShortcuts();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  return (
    <div className={s.app}>
      <LevelBar />
      <div className={s.body}>
        <Palette />

        <SplitLayout
          left={<CircuitPane paneId="decryption" title="Decryption" editable />}
          right={<CircuitPane paneId="encryption" title="Encryption" editable={false} />}
        />
      </div>

      {notice && (
        <div className={s.notice} title={notice}>
          {notice}
        </div>
      )}
    </div>
  );
}
