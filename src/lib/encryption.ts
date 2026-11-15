// ============================================================
// AES-256-GCM Verschlüsselung für sensitive CV/Brief-Daten
// Läuft ausschliesslich server-side (Node.js crypto)
//
// Cipher-Format: "v{N}:iv_hex:tag_hex:ciphertext_base64"
// Legacy-Format (ohne Präfix): "iv_hex:tag_hex:ciphertext_base64" → implizit v1
// ============================================================

import "server-only";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // bytes (256 bits)
const IV_LENGTH = 12;  // bytes (96 bits, GCM-Standard)

// ------------------------------------------------------------
// Key-Management
// ------------------------------------------------------------

function getKeyForVersion(version: number): Buffer {
  const envName = `ENCRYPTION_KEY_V${version}`;
  // Für v1: Fallback auf ENCRYPTION_KEY (Single-Key-Setup vor Versionierung)
  let keyHex = process.env[envName];
  if (!keyHex && version === 1) {
    keyHex = process.env.ENCRYPTION_KEY;
  }
  if (!keyHex) {
    throw new Error(`${envName} Umgebungsvariable fehlt`);
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `${envName} muss ${KEY_LENGTH * 2} Hex-Zeichen lang sein (aktuell: ${keyHex.length})`
    );
  }
  return key;
}

/**
 * Liefert die Key-Version, mit der neue Einträge geschrieben werden sollen.
 * Quelle: `ENCRYPTION_KEY_VERSION` (explizit) oder die höchste gesetzte V{N}-Env-Var
 * (Fallback: 1).
 */
export function getCurrentVersion(): number {
  const explicit = process.env.ENCRYPTION_KEY_VERSION;
  if (explicit) {
    const n = parseInt(explicit, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("ENCRYPTION_KEY_VERSION muss eine positive Zahl sein");
    }
    return n;
  }
  let max = 1;
  for (const name of Object.keys(process.env)) {
    const m = name.match(/^ENCRYPTION_KEY_V(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// ------------------------------------------------------------
// Parsing
// ------------------------------------------------------------

interface ParsedCiphertext {
  version: number;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

function parseEncrypted(data: string): ParsedCiphertext {
  const parts = data.split(":");
  if (parts.length === 4 && /^v\d+$/.test(parts[0])) {
    return {
      version: parseInt(parts[0].slice(1), 10),
      iv: Buffer.from(parts[1], "hex"),
      tag: Buffer.from(parts[2], "hex"),
      ciphertext: Buffer.from(parts[3], "base64"),
    };
  }
  if (parts.length === 3) {
    // Legacy: implizit v1
    return {
      version: 1,
      iv: Buffer.from(parts[0], "hex"),
      tag: Buffer.from(parts[1], "hex"),
      ciphertext: Buffer.from(parts[2], "base64"),
    };
  }
  throw new Error("Ungültiges Verschlüsselungsformat");
}

// ------------------------------------------------------------
// Encrypt / Decrypt
// ------------------------------------------------------------

export function encrypt(plaintext: string): string {
  const version = getCurrentVersion();
  const key = getKeyForVersion(version);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    `v${version}`,
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(encryptedData: string): string {
  const { version, iv, tag, ciphertext } = parseEncrypted(encryptedData);
  const key = getKeyForVersion(version);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ------------------------------------------------------------
// JSON-Helpers
// ------------------------------------------------------------

export function encryptJson(data: unknown): string {
  return encrypt(JSON.stringify(data));
}

export function decryptJson<T>(encryptedData: string): T {
  return JSON.parse(decrypt(encryptedData)) as T;
}

// Briefe entschlüsseln – mit Rückwärtskompatibilität für alte encryptJson-Einträge.
export function decryptLetter(encryptedData: string): string {
  const raw = decrypt(encryptedData);
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      /* fallthrough */
    }
  }
  return raw;
}

// ------------------------------------------------------------
// Migration-Support
// ------------------------------------------------------------

/**
 * True, wenn der Ciphertext mit einer älteren Key-Version als der aktuellen
 * verschlüsselt wurde. Verwendung: Nach `decrypt()` kann aufrufender Code den
 * Eintrag mit `encrypt()` neu speichern (Lazy-Re-Encrypt).
 */
export function needsReencryption(encryptedData: string): boolean {
  try {
    const { version } = parseEncrypted(encryptedData);
    return version < getCurrentVersion();
  } catch {
    return false;
  }
}

