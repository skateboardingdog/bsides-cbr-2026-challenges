import React, { useEffect, useState } from "react";

const STATUS_TEXT = {
    200: "OK",
    204: "No Content",
    302: "Found",
    400: "Bad Request",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    500: "Internal Server Error",
};

function statusText(code) {
    return STATUS_TEXT[code] || "";
}

function statusClass(code) {
    if (code >= 200 && code < 300) return "status-2xx";
    if (code >= 300 && code < 400) return "status-3xx";
    if (code >= 400 && code < 500) return "status-4xx";
    if (code >= 500) return "status-5xx";
    return "";
}

function formatRequestRaw(entry) {
    const target = entry.query_string
        ? `${entry.path}?${entry.query_string}`
        : entry.path;
    const lines = [`${entry.method} ${target} HTTP/1.1`];
    Object.entries(entry.request_headers || {}).forEach(([k, v]) =>
        lines.push(`${k}: ${v}`),
    );
    return lines.join("\n");
}

function formatResponseRaw(entry) {
    const lines = [`HTTP/1.1 ${entry.status} ${statusText(entry.status)}`];
    Object.entries(entry.response_headers || {}).forEach(([k, v]) =>
        lines.push(`${k}: ${v}`),
    );
    return lines.join("\n");
}

export default function HttpHistoryPanel({ subId, refreshKey }) {
    const [requests, setRequests] = useState(null);
    const [selected, setSelected] = useState(0);

    useEffect(() => {
        if (!subId) return;
        let cancelled = false;
        setRequests(null);
        fetch(`/api/trace/${subId}`)
            .then((r) => r.json())
            .then((d) => {
                if (cancelled) return;
                const list = d.requests || [];
                setRequests(list);
                setSelected(Math.max(0, list.length - 1));
            })
            .catch(() => {
                if (!cancelled) setRequests([]);
            });
        return () => {
            cancelled = true;
        };
    }, [subId, refreshKey]);

    if (!subId) return <p className="panel-empty">No requests</p>;
    if (requests === null) return <p className="panel-empty">Loading…</p>;
    if (requests.length === 0)
        return <p className="panel-empty">No requests</p>;

    const current = requests[selected];

    return (
        <div className="http-history">
            <table className="http-history-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Method</th>
                        <th>URL</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.map((r, i) => (
                        <tr
                            key={i}
                            className={
                                i === selected ? "history-row-selected" : ""
                            }
                            onClick={() => setSelected(i)}
                        >
                            <td>{i + 1}</td>
                            <td>
                                <span className="http-method">{r.method}</span>
                            </td>
                            <td className="http-url">
                                {r.path}
                                {r.query_string ? `?${r.query_string}` : ""}
                            </td>
                            <td>
                                <span
                                    className={`http-status ${statusClass(r.status)}`}
                                >
                                    {r.status}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {current && (
                <div className="http-split">
                    <div className="http-pane">
                        <div className="http-pane-title">Request Headers</div>
                        <pre className="http-raw">
                            {formatRequestRaw(current)}
                        </pre>
                    </div>
                    <div className="http-pane">
                        <div className="http-pane-title">Response Headers</div>
                        <pre className="http-raw">
                            {formatResponseRaw(current)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
