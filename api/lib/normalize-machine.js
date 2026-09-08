"use strict";

/**
 * Canonical machine labels for storage and analytics.
 * Keep the matching rules in sync with assets/analytics.js normalizeMachineName.
 */

const MACHINE_WORD = "machine";
const MAX_MACHINE_TYPOS = 2;
/** Short forms that sit further than MAX_MACHINE_TYPOS from "machine". */
const MACHINE_ABBREVIATIONS = ["m", "mc", "mch", "mcn", "mchn", "mach"];
const MACHINE_LABEL_RE = /^([A-Za-z][A-Za-z/.]*)?[-.\s#]*(?:no\.?|number)?[-.\s#]*(\d+)$/i;

/** Levenshtein distance, abandoned as soon as it is known to exceed max. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** Does the word in front of the number read as a (possibly misspelt) "machine"? */
function isMachineWord(token) {
  const word = token.replace(/[^a-z]/g, "");
  if (!word) return true; // bare "7" or "#7"
  if (MACHINE_ABBREVIATIONS.indexOf(word) !== -1) return true;
  // Short words are too easy to confuse with other labels (Mix 1, Mould 2).
  if (word.length < MACHINE_WORD.length - MAX_MACHINE_TYPOS) return false;
  return editDistance(word, MACHINE_WORD, MAX_MACHINE_TYPOS) <= MAX_MACHINE_TYPOS;
}

/**
 * Collapse anything that reads as "machine N" — Machine 1, Mchine 1, Maxchine 1,
 * MC-1, M/C No 1, bare 1 — onto the canonical "Machine 1". Any other label is
 * returned untouched.
 */
function normalizeMachineName(name) {
  const s = String(name || "").trim().replace(/\s+/g, " ");
  if (!s) return "Unassigned machine";
  const match = s.match(MACHINE_LABEL_RE);
  if (match && isMachineWord(String(match[1] || "").toLowerCase())) {
    return "Machine " + parseInt(match[2], 10);
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
