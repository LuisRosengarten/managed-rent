// AES-GCM encryption helpers using Web Crypto API (edge-compatible).
// Master key is a 32-byte value provided as base64 via APP_ENCRYPTION_KEY.

const IV_LENGTH = 12
const ALGO = "AES-GCM"

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

async function getMasterKey(): Promise<CryptoKey> {
  const keyB64 = process.env.APP_ENCRYPTION_KEY
  if (!keyB64) {
    throw new Error("APP_ENCRYPTION_KEY env var is required (32 bytes, base64)")
  }
  const raw = base64ToBytes(keyB64)
  if (raw.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must be 32 bytes (got ${raw.length}). Generate via: openssl rand -base64 32`
    )
  }
  return crypto.subtle.importKey("raw", raw as BufferSource, ALGO, false, [
    "encrypt",
    "decrypt",
  ])
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getMasterKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const cipher = await crypto.subtle.encrypt(
    { name: ALGO, iv: iv as BufferSource },
    key,
    encoded as BufferSource
  )
  const cipherBytes = new Uint8Array(cipher)
  const combined = new Uint8Array(iv.length + cipherBytes.length)
  combined.set(iv, 0)
  combined.set(cipherBytes, iv.length)
  return bytesToBase64(combined)
}

export async function decrypt(ciphertext: string): Promise<string> {
  const key = await getMasterKey()
  const combined = base64ToBytes(ciphertext)
  const iv = combined.slice(0, IV_LENGTH)
  const cipher = combined.slice(IV_LENGTH)
  const plain = await crypto.subtle.decrypt(
    { name: ALGO, iv: iv as BufferSource },
    key,
    cipher as BufferSource
  )
  return new TextDecoder().decode(plain)
}

export async function encryptJson<T>(value: T): Promise<string> {
  return encrypt(JSON.stringify(value))
}

export async function decryptJson<T>(ciphertext: string): Promise<T> {
  return JSON.parse(await decrypt(ciphertext)) as T
}
