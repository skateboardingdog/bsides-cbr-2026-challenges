import React from "react";

export default function ResultsPanel({ state, logs }) {
    return (
        <div className="results-panel">
            <div className={`results-status status-${state}`}>
                {state === "idle" && "Not run yet"}
                {state === "pending" && "Running..."}
                {state === "done" && "Finished"}
                {state === "error" && "Something went wrong"}
                {state === "timeout" && "Timed out"}
            </div>
            <div className="results-label">console.log output</div>
            <pre className="results-logs">
                {logs.length === 0 ? "(no output yet)" : logs.join("\n")}
            </pre>
        </div>
    );
}
