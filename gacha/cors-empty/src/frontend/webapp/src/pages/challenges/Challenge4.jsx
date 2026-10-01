import React from "react";
import ChallengePage from "../../components/ChallengePage.jsx";
import { VICTIM_ORIGIN } from "../../config.js";

export const meta = {
    id: 4,
    title: "cors-heavy",
};

const STARTER_CODE = `
<script>
fetch('${VICTIM_ORIGIN}/chal4/create-user', {
  method: "POST",
  body: new URLSearchParams({
    "username": "${Math.random().toString(36).substring(2, 9)}",
    "password": "${Math.random().toString(36).substring(2, 9)}",
  })
});
</script>
`;

export default function Challenge4() {
    return (
        <ChallengePage meta={meta} starterCode={STARTER_CODE}>
            <p className="concept-text">
                Okay, I've moved the dangerous user content to{" "}
                <code>usercontent.example.net</code> now, and set{" "}
                <code>SameSite=Lax</code>
                on all my cookies. Surely I'm safe now?
            </p>
        </ChallengePage>
    );
}
