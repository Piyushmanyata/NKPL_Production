"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { validateSheet, validateSheets } = require("../api/lib/production-db");
const { normalizeMachineName, normalizeMachineNameForStorage } = require("../api/lib/normalize-machine");

function loadAnalytics() {
  const context = { window: {} };
  vm.runInNewContext(readFileSync("assets/analytics.js", "utf8"), context, { filename: "assets/analytics.js" });
  return context.window.NKPLAnalytics;
}

function line(id, machine, shift, hours) {
  return { id, machine, shift, item: "11.5gm 28mm CSD", cycleTime: 20, cavity: 1, hours, grammage: 11.5, kgPerBag: 1, actualBags: hours };
}

test("utilisation uses full completed periods, caps future hours, and marks unlogged machines", function () {
  const analytics = loadAnalytics();
  const sheets = [
    { date: "2026-07-06", lines: [line("a", "Machine 1", "A", 8), line("b", "Machine 1", "B", 12), line("c", "Machine 2", "A", 4)] },
    { date: "2026-07-07", lines: [line("d", "Machine 1", "A", 12)] },
    { date: "2026-07-12", lines: [] }
  ];

  const currentWeek = analytics.summarizeWeek(sheets, "2026-07-06", "total");
  const m1 = currentWeek.utilizationMachines.find(function (machine) { return machine.label === "Machine 1"; });
  const m2 = currentWeek.utilizationMachines.find(function (machine) { return machine.label === "Machine 2"; });
  assert.equal(currentWeek.utilizationPeriodDays, 2);
  assert.equal(m1.availableHours, 48);
  assert.equal(m1.underutilizedHours, 16);
  assert.equal(m2.availableHours, 48);
  assert.equal(m2.underutilizedHours, 44);
  assert.equal(m2.recordedUnderutilizedHours, 8);
  assert.equal(m2.unloggedHours, 36);
  assert.equal(m2.utilizationStatus, "partial");

  const shiftA = analytics.summarizeWeek(sheets, "2026-07-06", "A");
  assert.equal(shiftA.utilizationMachines.find(function (machine) { return machine.label === "Machine 1"; }).availableHours, 24);

  const daily = analytics.summarizeSheet(sheets[1], "total", sheets);
  assert.equal(daily.utilizationMachines.find(function (machine) { return machine.label === "Machine 1"; }).utilizationStatus, "partial");
  assert.equal(daily.utilizationMachines.find(function (machine) { return machine.label === "Machine 2"; }).utilizationStatus, "unlogged");
  assert.match(analytics.reportHtml(daily, { scope: "day" }), /Potentially underutilized/);
  assert.match(analytics.reportHtml(daily, { scope: "day" }), /Unlogged/);

  const laterMachine = { date: "2026-07-13", lines: [line("e", "Machine 3", "A", 12)] };
  const completedWeek = analytics.summarizeWeek(sheets.concat(laterMachine), "2026-07-06", "total");
  assert.equal(completedWeek.utilizationPeriodDays, 7);
  assert.equal(completedWeek.utilizationMachines.some(function (machine) { return machine.label === "Machine 3"; }), false);

  const malformed = analytics.summarizeSheet({ date: "2026-07-07", lines: [line("bad", "Machine 1", "A", -2)] }, "A");
  const malformedMachine = malformed.utilizationMachines[0];
  assert.equal(malformedMachine.utilizationPct, 0);
  assert.equal(malformedMachine.underutilizedHours, malformedMachine.availableHours);
});

test("normalizeMachineName collapses typos and variants onto Machine N", function () {
  const analytics = loadAnalytics();
  const cases = [
    ["1", "Machine 1"],
    ["01", "Machine 1"],
    ["Machine 1", "Machine 1"],
    ["machine  2", "Machine 2"],
    ["MACHINE-3", "Machine 3"],
    ["Machine#4", "Machine 4"],
    ["Mchine 1", "Machine 1"],
    ["Mchine 5", "Machine 5"],
    ["Machne 2", "Machine 2"],
    ["Machin 3", "Machine 3"],
    ["Mach 6", "Machine 6"],
    ["MC 7", "Machine 7"],
    ["M/C 8", "Machine 8"],
    ["m/c9", "Machine 9"],
    ["  Machine 10  ", "Machine 10"],
    ["", "Unassigned machine"],
    ["   ", "Unassigned machine"],
    ["Line A", "Line A"],
    ["Mould 1", "Mould 1"]
  ];
  cases.forEach(function (pair) {
    assert.equal(analytics.normalizeMachineName(pair[0]), pair[1], JSON.stringify(pair[0]));
  });
});

test("typo machine names merge into one utilisation row", function () {
  const analytics = loadAnalytics();
  const sheet = {
    date: "2026-07-07",
    lines: [
      line("a", "Machine 1", "A", 8),
      line("b", "Mchine 1", "B", 10),
      line("c", "Mchine 2", "A", 6)
    ]
  };
  const summary = analytics.summarizeSheet(sheet, "total", [sheet]);
  const labels = summary.utilizationMachines.map(function (m) { return m.label; }).sort(function (a, b) {
    return a.localeCompare(b, undefined, { numeric: true });
  });
  assert.equal(labels.join("|"), "Machine 1|Machine 2");
  const m1 = summary.utilizationMachines.find(function (m) { return m.label === "Machine 1"; });
  assert.ok(m1, "Machine 1 row missing");
  assert.equal(m1.entries, 2);
  assert.equal(m1.runHours, 18);
  assert.equal(summary.machines.length, 2);
  assert.ok(summary.machines.every(function (m) { return /^Machine \d+$/.test(m.label); }));
});

test("save path normalizes machine typos before persistence", function () {
  assert.equal(normalizeMachineName("Mchine 1"), "Machine 1");
  assert.equal(normalizeMachineNameForStorage("Mchine 2"), "Machine 2");
  assert.equal(normalizeMachineNameForStorage(""), "");
  const sheet = validateSheet({
    date: "2026-07-08",
    lines: [line("typo", "Mchine 3", "A", 8)]
  });
  assert.equal(sheet.lines[0].machine, "Machine 3");
});

test("save validation rejects malformed, duplicate, and destructive line identities", function () {
  const valid = { date: "2026-07-08", lines: [line("safe", "Machine 1", "A", 8)] };
  assert.equal(validateSheet(valid).lines[0].id, "safe");
  assert.throws(function () { validateSheet({ date: "2026-02-30", lines: [] }); }, /Invalid daily sheet/);
  assert.throws(function () { validateSheet({ date: valid.date, lines: [{ ...valid.lines[0], id: "" }] }); }, /valid ID/);
  assert.throws(function () { validateSheet({ date: valid.date, lines: [valid.lines[0], valid.lines[0]] }); }, /duplicate line IDs/);
  assert.throws(function () { validateSheet({ date: valid.date, lines: [{ ...valid.lines[0], hours: -1 }] }); }, /invalid hours/);
  assert.throws(function () { validateSheet({ date: valid.date, lines: [{ ...valid.lines[0], hours: 12.1 }] }); }, /cannot exceed 12 hours/);
  assert.throws(function () { validateSheets([valid, valid]); }, /duplicate dates/);
});
