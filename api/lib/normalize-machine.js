"use strict";

/**
 * Canonical machine labels for storage and analytics.
 * Keep the matching rules in sync with assets/analytics.js normalizeMachineName.
 */
function normalizeMachineName(name) {
  const s = String(name || "").trim().replace(/\s+/g, " ");
  if (!s) return "Unassigned machine";
  if (/^\d+$/.test(s)) {
    return "Machine " + parseInt(s, 10);
  }
  // Collapse Machine / Mchine / Machne / MC / M/C / Mach + number to "Machine N"
  const match = s.match(/^m(?:achine|chine|achne|achin|ach|\/?c)?[-.\s#]*(\d+)$/i);
  if (match) {
    return "Machine " + parseInt(match[1], 10);
  }
  return s;
}

/** Empty stays empty in Postgres (analytics maps empty → Unassigned on display). */
function normalizeMachineNameForStorage(name) {
  const normalized = normalizeMachineName(name);
  return normalized === "Unassigned machine" ? "" : normalized;
}

module.exports = {
  normalizeMachineName,
  normalizeMachineNameForStorage
};
