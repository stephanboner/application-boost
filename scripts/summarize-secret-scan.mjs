#!/usr/bin/env node
/**
 * Print safe Gitleaks finding metadata without exposing Secret, Match, author
 * emails or file snippets. Keep the full report private and out of artifacts.
 */
import { existsSync, readFileSync } from "node:fs";

const report = process.argv[2];
if (!report || !existsSync(report)) {
  console.error("Gitleaks report was not generated; failing closed.");
  process.exit(2);
}
let findings;
try {
  findings = JSON.parse(readFileSync(report, "utf8"));
} catch {
  console.error("Gitleaks report was not valid JSON.");
  process.exit(2);
}
if (!Array.isArray(findings)) {
  console.error("Unexpected Gitleaks report structure.");
  process.exit(2);
}
console.log(`Gitleaks findings: ${findings.length}`);
for (const f of findings) {
  const file = String(f.File ?? "").replace(/[^A-Za-z0-9._/\-]/g, "?");
  const rule = String(f.RuleID ?? "").replace(/[^A-Za-z0-9_-]/g, "?");
  const commit = String(f.Commit ?? "").slice(0, 12).replace(/[^A-Fa-f0-9]/g, "");
  const line = Number.isInteger(f.StartLine) ? f.StartLine : "?";
  // The fingerprint identifies location and rule; it is NOT the secret.
  const fingerprint = String(f.Fingerprint ?? "").replace(/[^A-Za-z0-9_./:\-]/g, "?");
  console.log(`- ${rule} @ ${file}:${line} (commit ${commit || "unknown"}; fingerprint ${fingerprint})`);
}
if (findings.length > 0) {
  console.error("Review each finding privately. Do not expose raw report contents.");
  process.exit(1);
}
