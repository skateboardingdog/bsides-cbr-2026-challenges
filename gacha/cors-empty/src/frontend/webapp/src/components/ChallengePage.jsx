import React from "react";
import { Link } from "react-router-dom";
import SourceViewer from "./SourceViewer.jsx";
import Submitter from "./Submitter.jsx";

export default function ChallengePage({ meta, starterCode, children }) {
    return (
        <div className="page page-wide">
            <Link to="/" className="back-link">
                &larr; back
            </Link>
            <h1>{meta.title}</h1>

            <section className="step">{children}</section>

            <section className="step">
                <Submitter starterCode={starterCode} challengeId={meta.id} />
            </section>

            <section className="step">
                <p className="concept-text">View Source</p>
                <SourceViewer sourceKey={`chal${meta.id}`} />
            </section>
        </div>
    );
}
