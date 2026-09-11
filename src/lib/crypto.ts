// Web Crypto helpers shared by the auth and topic code. Nothing here depends
// on Node: the same functions run in workerd, Node, Deno and the browser.
const encoder = new TextEncoder();

export function utf8Bytes(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text) as Uint8Array<ArrayBuffer>;
}

export function utf8ByteLength(text: string): number {
  return utf8Bytes(text).byteLength;
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8Bytes(text))));
}

export async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", utf8Bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8Bytes(payload))));
}

// Constant-time string comparison: the loop always runs over the longer
// input, and a length mismatch only changes the result, not the timing.
export function constantTimeEquals(a: string, b: string): boolean {
  const left = utf8Bytes(a);
  const right = utf8Bytes(b);
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
