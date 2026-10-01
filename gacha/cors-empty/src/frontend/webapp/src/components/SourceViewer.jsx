import React, { useEffect, useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/themes/prism-tomorrow.css";

export default function SourceViewer({ sourceKey }) {
    const [code, setCode] = useState(null);
    const [filename, setFilename] = useState("");
    const [open, setOpen] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/source/${sourceKey}`)
            .then((r) => r.json())
            .then((d) => {
                if (cancelled) return;
                setCode(d.code ?? "# failed to load source");
                setFilename(d.filename ?? "");
            })
            .catch(() => {
                if (!cancelled) setCode("# failed to load source");
            });
        return () => {
            cancelled = true;
        };
    }, [sourceKey]);

    const highlighted = code
        ? Prism.highlight(code, Prism.languages.python, "python")
        : "";

    return (
        <div className="source-viewer">
            <button
                className="source-toggle"
                onClick={() => setOpen((o) => !o)}
            >
                {open ? "Hide" : "Show"}
            </button>
            {open && (
                <pre className="source-code">
                    <code
                        dangerouslySetInnerHTML={{
                            __html: highlighted || "Loading…",
                        }}
                    />
                </pre>
            )}
        </div>
    );
}
