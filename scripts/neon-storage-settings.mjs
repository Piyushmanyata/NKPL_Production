#!/usr/bin/env node
/**
 * scripts/neon-storage-settings.mjs
 *
 * Reads (and optionally sets) the Neon project's history retention window
 * via the Neon Management API. History retention is separate from table
 * data: Neon's storage layer keeps enough WAL/delta data to reconstruct any
 * point within that window, and that's billed as part of "Storage" even
 * though pg_database_size() only reports current table size. Cutting this
 * to 0 (no PITR) is the single biggest lever for a low-traffic project —
 * it removes the whole history buffer, not just dead tuples.
 *
 * Since PITR is disabled by this setting, rely on
 * `node scripts/backup-postgres.mjs` (run periodically) as the safety net
 * instead of Neon's point-in-time restore.
 *
 * Usage:
 *   node scripts/neon-storage-settings.mjs                 # show current settings
 *   node scripts/neon-storage-settings.mjs --set-retention 0
 *
 * Requires:
 *   NEON_API_KEY in .env.local or environment
 *   (create one at https://console.neon.tech -> Account Settings -> API Keys)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

try {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch { /* rely on env already set */ }

const NEON_API_KEY = process.env.NEON_API_KEY;
if (!NEON_API_KEY) {
  console.error("❌  NEON_API_KEY is not set (add it to .env.local).");
  process.exit(1);
}

const API = "https://console.neon.tech/api/v2";
const headers = { Authorization: `Bearer ${NEON_API_KEY}`, "Content-Type": "application/json" };

const args = process.argv.slice(2);
const setIdx = args.indexOf("--set-retention");
const newRetention = setIdx !== -1 ? Number(args[setIdx + 1]) : null;

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NKPL Production — Neon Storage Settings");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const orgsRes = await fetch(`${API}/users/me/organizations`, { headers });
const { organizations } = await orgsRes.json();

let allProjects = [];
for (const org of organizations || []) {
  const projRes = await fetch(`${API}/projects?org_id=${org.id}`, { headers });
  const body = await projRes.json();
  for (const p of body.projects || []) allProjects.push({ ...p, orgName: org.name });
}

if (!allProjects.length) {
  console.error("❌  No projects found for this API key.");
  process.exit(1);
}

for (const summary of allProjects) {
  // The list endpoint omits history_retention_seconds; fetch full detail.
  const detailRes = await fetch(`${API}/projects/${summary.id}`, { headers });
  const { project: p } = await detailRes.json();
  p.orgName = summary.orgName;

  console.log(`  Project: ${p.name} (${p.id})  [org: ${p.orgName}]`);
  console.log(`    history_retention_seconds : ${p.history_retention_seconds} (${(p.history_retention_seconds / 3600).toFixed(1)}h)`);

  if (newRetention !== null) {
    const patchRes = await fetch(`${API}/projects/${p.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ project: { history_retention_seconds: newRetention } }),
    });
    const patched = await patchRes.json();
    if (patched.project) {
      console.log(`    -> updated to ${patched.project.history_retention_seconds}s`);
    } else {
      console.log(`    -> update failed: ${patched.message || JSON.stringify(patched)}`);
    }
  }
}

console.log();
console.log("  Note: the billed 'Storage' figure in the Neon dashboard is a");
console.log("  periodic metric, not real-time — it can take hours to reflect");
console.log("  a lower retention window after garbage collection runs.");
console.log();
