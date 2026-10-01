import React from "react";
import ChallengePage from "../../components/ChallengePage.jsx";
import { VICTIM_ORIGIN } from "../../config.js";

export const meta = {
    id: 2,
    title: "cors-light",
};

const STARTER_CODE = `<script>
fetch('${VICTIM_ORIGIN}/chal2/create-user',{
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    "username": "${Math.random().toString(36).substring(2, 9)}",
    "password": "${Math.random().toString(36).substring(2, 9)}",
  })
});
</script>
`;

export default function Challenge2() {
    return (
        <ChallengePage meta={meta} starterCode={STARTER_CODE}>
            <p className="concept-text">
                Before making some cross-origin requests, the browser makes a{" "}
                <a href="https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request">
                    CORS Preflight Request
                </a>{" "}
                to check if the server understands the CORS protocol and allows
                the request to go through.
            </p>
            <p className="concept-text">
                In this app, I've removed any{" "}
                <code>Access-Control-Allow-*</code>
                headers from the user creation page. That means nobody else can
                call my APIs... right?
            </p>
        </ChallengePage>
    );
}
