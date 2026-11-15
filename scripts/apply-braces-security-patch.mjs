import { createHash } from "node:crypto";
import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

// No downloaded patch code or extra installer dependency. The reviewed hunks
// and both source hashes are committed alongside this script.
const patch = JSON.parse(await readFile(
  new URL("../patches/braces-3.0.3.json", import.meta.url), "utf8",
));
const sha256 = (source) => createHash("sha256").update(source).digest("hex");
const packages = [];
const visited = new Set();

async function entries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function inspectPackage(directory) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (manifest?.name === patch.packageName) packages.push({ directory, manifest });
  await findPackages(path.join(directory, "node_modules"));
}

async function findPackages(directory) {
  let resolved;
  try {
    resolved = await realpath(directory);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (visited.has(resolved)) return;
  visited.add(resolved);
  for (const entry of await entries(directory)) {
    if (entry.name.startsWith(".") || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
    const packageDirectory = path.join(directory, entry.name);
    if (entry.name.startsWith("@")) {
      for (const scoped of await entries(packageDirectory)) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          await inspectPackage(path.join(packageDirectory, scoped.name));
        }
      }
    } else {
      await inspectPackage(packageDirectory);
    }
  }
}

await findPackages(path.resolve("node_modules"));
const writes = [];
for (const { directory, manifest } of packages) {
  if (manifest.version !== patch.packageVersion) {
    throw new Error(`Review the braces security patch for installed version ${manifest.version}`);
  }
  for (const file of patch.files) {
    const filename = path.join(directory, file.path);
    let source = await readFile(filename, "utf8");
    const hash = sha256(source);
    if (hash === file.patchedSha256) continue;
    if (hash !== file.originalSha256) {
      throw new Error(`Unexpected braces source in ${file.path}; refusing to patch`);
    }
    for (const hunk of file.hunks) {
      if (source.split(hunk.before).length !== 2) {
        throw new Error(`Non-unique patch context in ${file.path}`);
      }
      source = source.replace(hunk.before, () => hunk.after);
    }
    if (sha256(source) !== file.patchedSha256) {
      throw new Error(`Patched braces hash mismatch in ${file.path}`);
    }
    writes.push({ filename, source });
  }
}
// Validate every installed copy before changing any file. Running again is safe.
for (const { filename, source } of writes) await writeFile(filename, source);
console.log(packages.length
  ? `braces security patch: ${packages.length} installed copy/copies verified; ${writes.length} files patched`
  : "braces security patch: package absent (production-only install)");
