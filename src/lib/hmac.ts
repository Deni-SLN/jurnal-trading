/**
 * HMAC helpers using Web Crypto API (works in both Node.js and Edge runtimes).
 * Avoids relying on Node's built-in `crypto` module which can cause
 * bundling issues in some Next.js 16 configurations.
 */

async function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
}

async function sign(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  return globalThis.crypto.subtle.sign("HMAC", key, enc.encode(data))
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

/** HMAC-SHA256 → hex (used by Bybit) */
export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await importKey(secret)
  const buf = await sign(key, data)
  return bufToHex(buf)
}

/** HMAC-SHA256 → base64 (used by OKX) */
export async function hmacSha256Base64(secret: string, data: string): Promise<string> {
  const key = await importKey(secret)
  const buf = await sign(key, data)
  return bufToBase64(buf)
}
