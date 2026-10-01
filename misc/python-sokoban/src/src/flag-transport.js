// Public, hardcoded key: this obscures the response from casual inspection.
// Server-side verification of all ten solutions remains the access boundary.
const KEY_HEX = "d7a136b8204fc6959e703ab4c28d51ef603be972ac84501d39f6e0b52791cad8";
const encoder = new TextEncoder();
const context = encoder.encode("python-sokoban/flag/v1");
let keyPromise;
function key() {
  return keyPromise ??= crypto.subtle.importKey("raw",
    Uint8Array.from(KEY_HEX.match(/../g), byte => parseInt(byte, 16)),
    "AES-GCM", false, ["encrypt", "decrypt"]);
}
const base64 = bytes => btoa(String.fromCharCode(...bytes));
function bytes(value, length) {
  if (typeof value !== "string" || value.length !== Math.ceil(length / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new Error("Invalid encrypted flag.");
  const decoded = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if (decoded.length !== length || base64(decoded) !== value) throw new Error("Invalid encrypted flag.");
  return decoded;
}
function validateFlag(flag) {
  if (typeof flag !== "string" || !/^[\x21-\x7e]{22}$/.test(flag)) throw new Error("Invalid flag.");
  return flag;
}

export async function encryptFlag(flag) {
  validateFlag(flag);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: context, tagLength: 128 },
    await key(), encoder.encode(flag));
  return { v: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(encrypted)) };
}

export async function decryptFlag(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
    envelope.v !== 1 || Object.keys(envelope).length !== 3) throw new Error("Invalid encrypted flag.");
  const iv = bytes(envelope.iv, 12), ciphertext = bytes(envelope.ciphertext, 22 + 16);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: context, tagLength: 128 },
    await key(), ciphertext);
  return validateFlag(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
}
