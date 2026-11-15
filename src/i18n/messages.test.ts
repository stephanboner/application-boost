import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { routing } from "./routing";

const messageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../messages");

function flatten(value: unknown, prefix = "", output: Record<string, string> = {}): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid translation catalogue at ${prefix || "<root>"}`);
  }
  for (const [key, item] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof item === "string") output[fullKey] = item;
    else flatten(item, fullKey, output);
  }
  return output;
}

function messages(locale: string) {
  return flatten(JSON.parse(readFileSync(resolve(messageDir, `${locale}.json`), "utf8")));
}

function placeholders(value: string) {
  return [...value.matchAll(/\{\s*([A-Za-z_][\w]*)\s*\}/g)].map((m) => m[1]).sort();
}

const reference = messages("de");
const referenceKeys = Object.keys(reference).sort();

describe("Internationalization catalogues", () => {
  it.each(routing.locales)("%s has every message and compatible interpolation placeholders", (locale) => {
    const catalogue = messages(locale);
    expect(Object.keys(catalogue).sort()).toEqual(referenceKeys);
    for (const key of referenceKeys) {
      expect(catalogue[key]?.trim(), `${locale}: ${key} must not be empty`).not.toBe("");
      expect(placeholders(catalogue[key]), `${locale}: ${key} placeholder mismatch`).toEqual(placeholders(reference[key]));
    }
  });
});
