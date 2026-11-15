import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encrypt,
  decrypt,
  encryptJson,
  decryptJson,
  decryptLetter,
  needsReencryption,
  getCurrentVersion,
} from "../encryption";

describe("encryption", () => {
  describe("encrypt/decrypt round-trip", () => {
    it("returns the original plaintext", () => {
      const plaintext = "Hallo Welt – öäü ✨";
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    it("handles empty strings", () => {
      expect(decrypt(encrypt(""))).toBe("");
    });

    it("handles long payloads", () => {
      const long = "x".repeat(10_000);
      expect(decrypt(encrypt(long))).toBe(long);
    });

    it("produces distinct ciphertexts for identical plaintext (unique IV)", () => {
      const a = encrypt("same");
      const b = encrypt("same");
      expect(a).not.toBe(b);
    });

    it("prefixes new ciphertexts with the current version", () => {
      expect(encrypt("x")).toMatch(/^v1:/);
    });
  });

  describe("JSON helpers", () => {
    it("round-trips a nested object", () => {
      const data = { a: 1, b: [true, "x"], c: { d: null } };
      expect(decryptJson<typeof data>(encryptJson(data))).toEqual(data);
    });
  });

  describe("tamper detection", () => {
    it("throws when the ciphertext is modified", () => {
      const enc = encrypt("secret");
      const [v, iv, tag, ct] = enc.split(":");
      const flipped = Buffer.from(ct, "base64");
      flipped[0] ^= 0xff;
      const tampered = [v, iv, tag, flipped.toString("base64")].join(":");
      expect(() => decrypt(tampered)).toThrow();
    });

    it("throws when the auth tag is modified", () => {
      const enc = encrypt("secret");
      const [v, iv, tag, ct] = enc.split(":");
      const flipped = Buffer.from(tag, "hex");
      flipped[0] ^= 0xff;
      const tampered = [v, iv, flipped.toString("hex"), ct].join(":");
      expect(() => decrypt(tampered)).toThrow();
    });

    it("throws on malformed input (missing parts)", () => {
      expect(() => decrypt("only:two")).toThrow(/Ungültiges Verschlüsselungsformat/);
    });
  });

  describe("decryptLetter legacy compatibility", () => {
    it("unwraps legacy JSON-encoded strings", () => {
      const legacy = encryptJson("Mein Brief");
      expect(decryptLetter(legacy)).toBe("Mein Brief");
    });

    it("returns raw text for new-format letters", () => {
      const fresh = encrypt("Mein Brief");
      expect(decryptLetter(fresh)).toBe("Mein Brief");
    });

    it("preserves strings that happen to start/end with quotes", () => {
      const plain = '"nicht JSON": { broken';
      const enc = encrypt(plain);
      expect(decryptLetter(enc)).toBe(plain);
    });
  });

  describe("legacy unversioned ciphertexts (3-part)", () => {
    it("decrypts an unversioned ciphertext as implicit v1", () => {
      const enc = encrypt("hallo");
      // Strip "v1:" to simulate a pre-versioning entry in the DB
      const legacy = enc.replace(/^v1:/, "");
      expect(legacy.split(":").length).toBe(3);
      expect(decrypt(legacy)).toBe("hallo");
    });
  });

  describe("key validation", () => {
    it("throws when no key for the requested version is available", async () => {
      const originalV1 = process.env.ENCRYPTION_KEY_V1;
      const originalFallback = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY_V1;
      delete process.env.ENCRYPTION_KEY;
      try {
        const mod = await import("../encryption");
        expect(() => mod.encrypt("x")).toThrow(/ENCRYPTION_KEY_V1/);
      } finally {
        if (originalV1 !== undefined) process.env.ENCRYPTION_KEY_V1 = originalV1;
        if (originalFallback !== undefined) process.env.ENCRYPTION_KEY = originalFallback;
      }
    });

    it("throws when the key has wrong length", async () => {
      const original = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = "deadbeef";
      try {
        const mod = await import("../encryption");
        expect(() => mod.encrypt("x")).toThrow(/64 Hex-Zeichen/);
      } finally {
        if (original !== undefined) {
          process.env.ENCRYPTION_KEY = original;
        } else {
          delete process.env.ENCRYPTION_KEY;
        }
      }
    });

    it("throws on unknown cipher version when decrypting", () => {
      expect(() =>
        decrypt("v99:aa:bb:cc")
      ).toThrow(/ENCRYPTION_KEY_V99/);
    });
  });

  describe("key rotation", () => {
    const V2_KEY =
      "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

    beforeEach(() => {
      process.env.ENCRYPTION_KEY_V2 = V2_KEY;
      process.env.ENCRYPTION_KEY_VERSION = "2";
    });

    afterEach(() => {
      delete process.env.ENCRYPTION_KEY_V2;
      delete process.env.ENCRYPTION_KEY_VERSION;
    });

    it("reports the current version via getCurrentVersion()", () => {
      expect(getCurrentVersion()).toBe(2);
    });

    it("writes new entries with the v2 prefix", () => {
      expect(encrypt("x")).toMatch(/^v2:/);
    });

    it("still decrypts entries written under v1", () => {
      process.env.ENCRYPTION_KEY_VERSION = "1";
      const v1Entry = encrypt("altes CV");
      expect(v1Entry).toMatch(/^v1:/);

      process.env.ENCRYPTION_KEY_VERSION = "2";
      expect(decrypt(v1Entry)).toBe("altes CV");
    });

    it("needsReencryption flags v1 entries while v2 is current", () => {
      process.env.ENCRYPTION_KEY_VERSION = "1";
      const v1Entry = encrypt("alt");

      process.env.ENCRYPTION_KEY_VERSION = "2";
      expect(needsReencryption(v1Entry)).toBe(true);

      const v2Entry = encrypt("neu");
      expect(needsReencryption(v2Entry)).toBe(false);
    });

    it("needsReencryption returns false for unparseable input", () => {
      // Kein Doppelpunkt → weder versioned noch legacy
      expect(needsReencryption("totally-broken")).toBe(false);
    });

    it("falls back to the highest V{N} env when ENCRYPTION_KEY_VERSION is unset", () => {
      delete process.env.ENCRYPTION_KEY_VERSION;
      expect(getCurrentVersion()).toBe(2);
      expect(encrypt("x")).toMatch(/^v2:/);
    });

    it("rejects non-numeric ENCRYPTION_KEY_VERSION", () => {
      process.env.ENCRYPTION_KEY_VERSION = "zwei";
      expect(() => encrypt("x")).toThrow(/positive Zahl/);
    });
  });
});
