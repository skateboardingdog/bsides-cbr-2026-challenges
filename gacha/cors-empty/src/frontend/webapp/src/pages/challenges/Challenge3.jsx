import React from "react";
import ChallengePage from "../../components/ChallengePage.jsx";
import { VICTIM_ORIGIN } from "../../config.js";

export const meta = {
    id: 3,
    title: "cors-medium",
};

const STARTER_CODE = `<script>
fetch('${VICTIM_ORIGIN}/chal3/create-user',{
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

export default function Challenge3() {
    return (
        <ChallengePage meta={meta} starterCode={STARTER_CODE}>
            <p className="concept-text">
                This time, I'm double checking the content type. No skipping the
                preflight checks!
            </p>
        </ChallengePage>
    );
}
