import React from "react";
import ChallengePage from "../../components/ChallengePage.jsx";
import { VICTIM_ORIGIN } from "../../config.js";
import excalidraw1 from "../../static/excalidraw1.svg";

export const meta = {
    id: 1,
    title: "cors-empty",
};

const STARTER_CODE = `<script>
  fetch("http://app.example.com/chal1/secret", {
    method: "POST",
    credentials: "include",
    body: new URLSearchParams({
      "X-My-Chosen-Response-Header": "Header-Value",
    }),
  })
    .then((r) => r.json())
    .then((d) => console.log(d.flag))
    .catch((e) => console.log("blocked:", e));
</script>
`;

export default function Challenge1() {
    return (
        <ChallengePage meta={meta} starterCode={STARTER_CODE}>
            <p className="concept-text">
                A user has logged into <code>app.example.com</code> and received
                a session cookie. They then click on a link to
                <code>usercontent.example.com</code> where they encounter your
                malicious HTML and JavaScript.
            </p>
            <p className="concept-text">
                This means that if you make HTTP requests with the{" "}
                <code>credentials: include</code> option, those requests will
                carry the user's session cookie!
            </p>
            <div style={{ textAlign: "center" }}>
                <img
                    src={excalidraw1}
                    style={{ width: "50%", height: "auto" }}
                />
            </div>
            <p className="concept-text">
                The user has secret flag located at{" "}
                <code>http://app.example.com/chal1/secret</code>, which you can
                now request using their cookie. However, there is a web security
                mechanism which stops you from reading the response, called
                Same-Origin Policy.
            </p>
            <p className="concept-text">
                Here are some resources on Same-Origin Policy, Cross-Origin
                Resource Sharing, and Cross-Site Attacks to get you started.
                <ul>
                    <li>
                        <a href="https://aszx87410.github.io/beyond-xss/en/ch4/sop-and-site/">
                            Beyond XSS: Same-Origin Policy and Site
                        </a>
                    </li>
                    <li>
                        <a href="https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy">
                            MDN: Same Origin Policy
                        </a>
                    </li>
                    <li>
                        <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS">
                            MDN: Cross-Origin Resource Sharing
                        </a>
                    </li>
                </ul>
            </p>
            <p className="concept-text">
                Can you find a way to make the response content readable from
                your own JavaScript? Hint: The application lets you control the
                headers that are set in the response.
            </p>
        </ChallengePage>
    );
}
