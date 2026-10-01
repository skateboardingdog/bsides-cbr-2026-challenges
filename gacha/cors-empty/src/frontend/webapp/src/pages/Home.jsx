import React from "react";
import { Link } from "react-router-dom";
import { meta as chal1 } from "./challenges/Challenge1.jsx";
import { meta as chal2 } from "./challenges/Challenge2.jsx";
import { meta as chal3 } from "./challenges/Challenge3.jsx";
import { meta as chal4 } from "./challenges/Challenge4.jsx";

const CHALLENGES = [chal1, chal2, chal3, chal4];

export default function Home() {
    return (
        <div className="page">
            <h2>Welcome to the Cross-Site Bar!</h2>
            <p>
                Every challenge has its own flag. Submit the flag after solving
                a challenge before moving onto the next level.
            </p>
            <div className="chal-grid">
                {CHALLENGES.map((c) => (
                    <Link key={c.id} to={`/chal/${c.id}`} className="chal-card">
                        <span className="chal-number">Challenge {c.id}</span>
                        <h2>{c.title}</h2>
                    </Link>
                ))}
            </div>
        </div>
    );
}
