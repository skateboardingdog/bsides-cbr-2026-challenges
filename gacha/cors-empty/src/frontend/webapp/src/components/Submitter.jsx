import { useBotRun } from "../hooks/useBotRun.js";
import ResultsPanel from "./ResultsPanel.jsx";
import HttpHistoryPanel from "./HttpHistoryPanel.jsx";
import Editor from "./Editor.jsx";

export default function Submitter({ starterCode, challengeId }) {
    const { code, setCode, run, state, logs, subId, error } = useBotRun(
        challengeId,
        starterCode,
    );

    const hasRun = state === "done" || state === "error" || state === "timeout";
    return (
        <>
            <Editor code={code} onChange={setCode} />
            <div className="run-row">
                <button onClick={run} disabled={state === "pending"}>
                    {state === "pending" ? "Running…" : "Run"}
                </button>
                {error && <span className="error-text">{error}</span>}
            </div>

            <ResultsPanel state={state} logs={logs} />

            {hasRun && (
                <div className="history-block">
                    <h3>HTTP History</h3>
                    <HttpHistoryPanel subId={subId} refreshKey={state} />
                </div>
            )}
        </>
    );
}
