// Run explicitly with Node's test runner; Vitest handles the application's tests.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const installer = path.join(root, "scripts/apply-braces-security-patch.mjs");
const patch = JSON.parse(readFileSync(path.join(root, "patches/braces-3.0.3.json"), "utf8"));
const sha256 = (source) => createHash("sha256").update(source).digest("hex");
let braces;
let installedDirectory;
try {
  installedDirectory = path.dirname(require.resolve("braces/package.json"));
  braces = require("braces");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}
const installed = { skip: !braces };
const pattern = (depth, open = "{", close = "}") => open.repeat(depth) + "a,b" + close.repeat(depth);
const ast = (depth) => {
  let node = { type: "text", value: "a" };
  for (let i = 0; i < depth; i++) node = { type: "brace", nodes: [node] };
  return { type: "root", nodes: [node] };
};

test("all installed braces copies have the reviewed security patch", () => {
  const result = spawnSync("npm", ["ls", "braces", "--all", "--parseable"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  let copies = 0;
  for (const directory of result.stdout.trim().split("\n").filter(Boolean)) {
    const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
    if (manifest.name !== "braces") continue;
    copies++;
    assert.equal(manifest.version, patch.packageVersion);
    for (const file of patch.files) {
      assert.equal(sha256(readFileSync(path.join(directory, file.path))), file.patchedSha256, file.path);
    }
  }
  assert.equal(copies > 0, Boolean(braces));
});

for (const api of ["parse", "compile", "expand", "stringify"]) {
  test(`${api}: accepts nesting depth 100`, installed, () => {
    assert.doesNotThrow(() => braces[api](pattern(100)));
    assert.doesNotThrow(() => braces[api](pattern(100, "(", ")")));
  });
  test(`${api}: rejects braces and parentheses at depth 101`, installed, () => {
    assert.throws(() => braces[api](pattern(101)), /Input depth .*exceeds max depth/);
    assert.throws(() => braces[api](pattern(101, "(", ")")), /Input depth .*exceeds max depth/);
  });
  test(`${api}: blocks the under-length stack-exhaustion payload`, installed, () => {
    const attack = pattern(4500);
    assert.ok(attack.length < 10000);
    assert.throws(() => braces[api](attack), /Input depth .*exceeds max depth/);
  });
  test(`${api}: callers cannot raise or bypass the depth cap`, installed, () => {
    for (const maxDepth of [5000, Infinity, NaN]) {
      assert.throws(() => braces[api](pattern(101), { maxDepth }), /exceeds max depth/);
    }
    assert.doesNotThrow(() => braces[api](pattern(1), { maxDepth: 1.5 }));
    assert.throws(() => braces[api](pattern(2), { maxDepth: 1.5 }), /exceeds max depth/);
  });
}

for (const api of ["compile", "expand", "stringify"]) {
  test(`${api}: validates caller-supplied AST depth`, installed, () => {
    assert.doesNotThrow(() => braces[api](ast(100)));
    assert.throws(() => braces[api](ast(101)), /AST depth .*exceeds max depth/);
  });
  test(`${api}: rejects a cyclic child AST without stack exhaustion`, installed, () => {
    const node = { type: "brace", nodes: [] };
    node.nodes.push(node);
    assert.throws(() => braces[api]({ type: "root", nodes: [node] }), /AST depth .*exceeds max depth/);
  });
}

test("expand: cyclic parent chains terminate with a controlled error", installed, () => {
  for (const multiple of [false, true]) {
    const node = { type: "paren", nodes: [{ type: "text", value: "a" }] };
    node.parent = multiple ? { type: "paren", parent: node } : node;
    assert.throws(
      () => vm.runInNewContext("braces.expand(node)", { braces, node }, { timeout: 1000 }),
      /AST parent chain contains a cycle/,
    );
  }
});

test("ordinary globs, ranges, parentheses and escaping retain their behaviour", installed, () => {
  assert.deepEqual(braces.expand("file-{01..03}.{ts,tsx}"), [
    "file-01.ts", "file-01.tsx", "file-02.ts", "file-02.tsx", "file-03.ts", "file-03.tsx",
  ]);
  assert.deepEqual(braces.expand("foo/({a,b})"), ["foo/(a)", "foo/(b)"]);
  for (const value of ["{{a}}", "{a,{b}}", "{{x}y}", "{a,{b,{c}}", "{}{a}"]) {
    assert.equal(braces.stringify(value, { escapeInvalid: true }), value);
  }
  const micromatch = require("micromatch");
  assert.deepEqual(micromatch([
    "src/app/de/page.tsx", "src/lib/helpers.ts", "messages/de.json", "node_modules/x/index.js",
  ], ["src/**/*.{ts,tsx}", "messages/**/*.json"]), [
    "src/app/de/page.tsx", "src/lib/helpers.ts", "messages/de.json",
  ]);
});

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "braces-security-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function originalPackage(directory, version = patch.packageVersion) {
  mkdirSync(path.join(directory, "lib"), { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "braces", version }));
  for (const file of patch.files) {
    let source = readFileSync(path.join(installedDirectory, file.path), "utf8");
    for (const hunk of [...file.hunks].reverse()) {
      source = source.replace(hunk.after, () => hunk.before);
    }
    assert.equal(sha256(source), file.originalSha256);
    writeFileSync(path.join(directory, file.path), source);
  }
}

function install(directory) {
  return spawnSync(process.execPath, [installer], { cwd: directory, encoding: "utf8", timeout: 10000 });
}

test("installer patches top-level and scoped nested copies and is idempotent", installed, (t) => {
  const directory = fixture(t);
  const copies = [
    path.join(directory, "node_modules/braces"),
    path.join(directory, "node_modules/@fixture/tool/node_modules/braces"),
  ];
  for (const copy of copies) originalPackage(copy);
  let result = install(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 installed copy\/copies verified; 10 files patched/);
  for (const copy of copies) for (const file of patch.files) {
    assert.equal(sha256(readFileSync(path.join(copy, file.path))), file.patchedSha256);
  }
  result = install(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 files patched/);
});

test("installer refuses unexpected source before changing any copy", installed, (t) => {
  const directory = fixture(t);
  const first = path.join(directory, "node_modules/braces");
  const second = path.join(directory, "node_modules/tool/node_modules/braces");
  originalPackage(first);
  originalPackage(second);
  writeFileSync(path.join(second, "lib/parse.js"), "unreviewed code");
  const result = install(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected braces source/);
  for (const file of patch.files) {
    assert.equal(sha256(readFileSync(path.join(first, file.path))), file.originalSha256);
  }
});

test("installer refuses an unreviewed version", installed, (t) => {
  const directory = fixture(t);
  originalPackage(path.join(directory, "node_modules/braces"), "3.0.4");
  const result = install(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Review the braces security patch/);
});

test("production-only installation succeeds without braces", (t) => {
  const result = install(fixture(t));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /package absent/);
});
