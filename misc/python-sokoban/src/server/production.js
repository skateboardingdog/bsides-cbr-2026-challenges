import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { Worker } from "node:worker_threads";
import { levels } from "../src/levels.js";
import { validProofPayload } from "./verify-campaign.js";
import { encryptFlag } from "../src/flag-transport.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".opus": "audio/ogg", ".m4a": "audio/mp4" };
const MAX_BODY = 110000;

export async function createProductionServer({ directory = join(root, "dist"), flag, trustedCampaign = levels, maxVerifiers = 2 } = {}) {
  if (typeof flag !== "string" || flag.length !== 22 || !/^[\x21-\x7e]+$/.test(flag)) throw new Error("FLAG_MESSAGE must contain exactly 22 printable ASCII characters.");
  const assets = new Map(), workers = new Set();
  async function load(folder, prefix = "") {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) await load(join(folder, entry.name), `${prefix}/${entry.name}`);
      else if (entry.isFile()) {
        const body = await readFile(join(folder, entry.name));
        assets.set(`${prefix}/${entry.name}`, { body, type: types[extname(entry.name)] ?? "application/octet-stream",
          gzip: /\.(?:html|js|css|svg|json)$/.test(entry.name) ? gzipSync(body) : null });
      }
    }
  }
  await load(directory);
  if (!assets.has("/index.html")) throw new Error("Build production assets first.");
  // Refuse to start with a development build or an accidentally bundled secret.
  for (const [path, asset] of assets) if (/\.(?:html|js|json|map)$/.test(path) &&
    (asset.body.includes(Buffer.from(flag)) || asset.body.includes(Buffer.from('/src/main.js')) || asset.body.includes(Buffer.from('level-json'))))
    throw new Error("The static build contains development data. Run npm run build.");

  function verify(payload) {
    if (workers.size >= maxVerifiers) return null;
    return new Promise(resolve => {
      const worker = new Worker(new URL("./verify-worker.js", import.meta.url), { workerData: { payload, campaign: trustedCampaign },
        resourceLimits: { maxOldGenerationSizeMb: 64 } });
      workers.add(worker);
      let settled = false;
      const finish = result => {
        if (settled) return; settled = true;
        clearTimeout(timeout); workers.delete(worker); void worker.terminate(); resolve(result);
      };
      const timeout = setTimeout(() => finish(null), 10000);
      worker.once("message", result => finish(result === true));
      worker.once("error", () => finish(null));
      worker.once("exit", () => finish(null));
    });
  }
  const json = (response, status, value) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(value));
  };
  const redirectToGame = response => {
    response.writeHead(302, { Location: "/", "Cache-Control": "no-store", "Content-Length": 0 });
    response.end();
  };
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    let path;
    const isPageRequest = request.method === "GET" || request.method === "HEAD";
    try {
      // Treat leading slashes as a local path, never as a URL authority.
      const url = request.url.startsWith("/") ? `http://localhost${request.url}` : request.url;
      path = decodeURIComponent(new URL(url).pathname);
    } catch {
      if (isPageRequest) redirectToGame(response);
      else json(response, 400, { error: "Invalid request." });
      return;
    }
    try {
      if (path === "/api/flag") {
        if (request.method !== "POST") { response.setHeader("Allow", "POST"); json(response, 405, { error: "Use POST." }); return; }
        if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") { json(response, 415, { error: "Use application/json." }); request.resume(); return; }
        if (Number(request.headers["content-length"]) > MAX_BODY) { json(response, 413, { error: "Request too large." }); request.resume(); return; }
        let size = 0, chunks = [];
        for await (const chunk of request) {
          size += chunk.length;
          if (size > MAX_BODY) { json(response, 413, { error: "Request too large." }); request.resume(); return; }
          chunks.push(chunk);
        }
        let payload;
        try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { json(response, 400, { error: "Invalid proof format." }); return; }
        if (!validProofPayload(payload)) { json(response, 400, { error: "Provide UDLR solutions for all ten levels." }); return; }
        const pending = verify(payload);
        if (!pending) { response.setHeader("Retry-After", "2"); json(response, 503, { error: "Try again shortly." }); return; }
        const valid = await pending;
        if (response.destroyed) return;
        if (valid === null) { json(response, 503, { error: "Verification unavailable. Try again." }); return; }
        if (!valid) { json(response, 403, { error: "Solve all ten levels first." }); return; }
        json(response, 200, await encryptFlag(flag)); return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") { response.setHeader("Allow", "GET, HEAD"); json(response, 405, { error: "Method not allowed." }); return; }
      const asset = assets.get(path === "/" ? "/index.html" : path);
      if (!asset) {
        if (path === "/api" || path.startsWith("/api/")) json(response, 404, { error: "Not found." });
        else redirectToGame(response);
        return;
      }
      response.setHeader("Cache-Control", path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
      response.setHeader("Content-Type", asset.type);
      response.setHeader("Accept-Ranges", "bytes");
      if (request.method === "GET" && request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range), length = asset.body.length;
        let start = 0, end = length - 1, valid = Boolean(match && (match[1] || match[2]) && length);
        if (valid && match[1]) {
          start = Number(match[1]); if (match[2]) end = Number(match[2]);
          valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < length;
          end = Math.min(end, length - 1);
        } else if (valid) {
          const suffix = Number(match[2]); valid = Number.isSafeInteger(suffix) && suffix > 0; start = Math.max(0, length - suffix);
        }
        if (!valid) { response.writeHead(416, { "Content-Range": `bytes */${length}`, "Content-Length": 0 }); response.end(); return; }
        response.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${length}`, "Content-Length": end - start + 1 });
        response.end(asset.body.subarray(start, end + 1)); return;
      }
      const zipped = asset.gzip && /\bgzip\b/.test(request.headers["accept-encoding"] ?? "");
      if (asset.gzip) response.setHeader("Vary", "Accept-Encoding");
      if (zipped) response.setHeader("Content-Encoding", "gzip");
      const body = zipped ? asset.gzip : asset.body;
      response.writeHead(200, { "Content-Length": body.length }); response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      if (!response.headersSent && !response.destroyed) json(response, 500, { error: "Request could not be completed." });
      else response.end();
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  server.on("close", () => { for (const worker of workers) void worker.terminate(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createProductionServer({ flag: process.env.FLAG_MESSAGE });
  const port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? "127.0.0.1";
  server.listen(port, host, () => console.log(`python sokoban production listening on ${host}:${port}`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
}
