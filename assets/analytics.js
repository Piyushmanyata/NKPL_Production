(function () {
  "use strict";

  function num(value) {
    if (value === "" || value == null) return null;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function fmt(value, digits) {
    if (value == null || !Number.isFinite(value)) return "-";
    return value.toLocaleString("en-US", { maximumFractionDigits: digits == null ? 1 : digits });
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeMachineName(name) {
    var s = String(name || "").trim();
    if (!s) return "Unassigned machine";
    if (/^\d+$/.test(s)) {
      return "Machine " + parseInt(s, 10);
    }
    var match = s.match(/^machine[- ]*(\d+)$/i);
    if (match) {
      return "Machine " + parseInt(match[1], 10);
    }
    return s;
  }

  function normalizeItemName(name) {
    if (!name) return "";
    var s = String(name).trim().toLowerCase();
    
    // 1. Extract weight (gm/g)
    var weightMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:gm|g|grams?)\b/i);
    var weight = weightMatch ? parseFloat(weightMatch[1]).toString() + "gm" : "";
    
    // 2. Extract neck size (mm)
    var neckMatch = s.match(/(\d+)\s*mm\b/i);
    var neck = neckMatch ? neckMatch[1] + "mm" : "";
    
    // 3. Extract type
    var type = "";
    if (s.includes("star") || s.includes("tsar")) {
      type = "star";
    } else if (s.includes("jar")) {
      type = "jar";
    } else if (s.includes("ropp")) {
      type = "ropp";
    } else if (s.includes("csd") || s.includes("pco")) {
      type = "csd";
    }
    
    // Infer missing neck size if possible
    if (!neck && weight) {
      var wNum = parseFloat(weight);
      if (wNum === 10.5 && type === "csd") neck = "28mm";
      else if (wNum === 11.5) neck = "28mm";
      else if (wNum === 22) neck = "28mm";
      else if (wNum === 24.5) neck = "28mm";
      else if (wNum === 10.2) neck = "28mm";
      else if (wNum === 7.1) neck = "28mm";
      else if (wNum === 8.6) neck = "28mm";
      else if (wNum === 9.5) neck = "28mm";
      else if (wNum === 18.5) neck = "28mm";
      else if (wNum === 16 && type === "csd") neck = "28mm";
    }

    // 4. Extract modifiers
    var modifiers = [];
    if (s.includes("hf")) {
      modifiers.push("hf");
    }
    
    // Extract thread configurations like 22/22 or 26/22
    var threadMatch = s.match(/(\d+\/\d+)/);
    if (threadMatch) {
      modifiers.push(threadMatch[1]);
    }
    
    // Construct normalized key
    var parts = [];
    if (weight) parts.push(weight);
    if (neck) parts.push(neck);
    if (type) parts.push(type);
    if (modifiers.length > 0) {
      parts.push(modifiers.sort().join(" "));
    }
    
    // Fallback if none of the patterns matched
    if (parts.length === 0) {
      s = s.replace(/\./g, "");
      s = s.replace(/[-_]+/g, " ");
      s = s.replace(/\s+/g, " ");
      return s.trim();
    }
    
    return parts.join(" ");
  }

  function lineHasContent(line) {
    if (!line || typeof line !== "object") return false;
    return ["machine", "item", "cycleTime", "cavity", "hours", "grammage", "kgPerBag", "actualBags", "remark"].some(function (key) {
      var value = line[key];
      return value !== null && value !== undefined && String(value).trim() !== "";
    });
  }

  function localDateISO(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function weekStart(date) {
    var day = new Date(date + "T00:00:00");
    var weekday = day.getDay() || 7;
    day.setDate(day.getDate() - weekday + 1);
    return localDateISO(day);
  }

  function monthStart(date) {
    if (!date) return "";
    return date.slice(0, 7) + "-01";
  }

  function formatDate(date) {
    if (!date) return "-";
    return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function statusWord(status) {
    if (status === "ok") return "On target";
    if (status === "under") return "Under target";
    if (status === "over") return "Over target";
    return "Not checked";
  }

  function shiftLabel(shiftFilter) {
    return shiftFilter && shiftFilter !== "total" ? "Shift " + shiftFilter : "All shifts";
  }

  function computeLine(line, tolerance) {
    var cycleTime = num(line.cycleTime);
    var cavity = num(line.cavity);
    var hours = num(line.hours);
    var grammage = num(line.grammage);
    var kgPerBag = num(line.kgPerBag);
    var actualBags = num(line.actualBags);
    var targetPieces = cycleTime > 0 && cavity != null && hours != null
      ? 3600 / cycleTime * cavity * hours
      : null;
    var targetKg = targetPieces != null && grammage != null
      ? targetPieces * grammage / 1000
      : null;
    var targetBags = targetKg != null && kgPerBag > 0
      ? targetKg / kgPerBag
      : null;
    var actualKg = actualBags != null && kgPerBag != null
      ? actualBags * kgPerBag
      : null;
    var actualPieces = actualKg != null && grammage > 0
      ? actualKg * 1000 / grammage
      : null;
    var varianceBags = targetBags != null && actualBags != null ? actualBags - targetBags : null;
    var varianceKg = targetKg != null && actualKg != null ? actualKg - targetKg : null;
    var variancePct = targetBags > 0 && varianceBags != null ? varianceBags / targetBags * 100 : null;
    var efficiency = targetBags > 0 && actualBags != null ? actualBags / targetBags * 100 : null;
    var status = varianceBags == null
      ? "idle"
      : varianceBags < -1.5
        ? "under"
        : varianceBags > 1.5
          ? "over"
          : "ok";
    return {
      id: line.id || "",
      date: line.date || "",
      machine: normalizeMachineName(line.machine),
      item: String(line.item || "").trim() || "Unspecified item",
      remark: String(line.remark || "").trim(),
      cycleTime: cycleTime,
      cavity: cavity,
      hours: hours,
      grammage: grammage,
      kgPerBag: kgPerBag,
      actualBags: actualBags,
      targetBags: targetBags,
      actualKg: actualKg,
      targetKg: targetKg,
      actualPieces: actualPieces,
      targetPieces: targetPieces,
      varianceBags: varianceBags,
      varianceKg: varianceKg,
      variancePct: variancePct,
      efficiency: efficiency,
      status: status
    };
  }

  function add(target, entry) {
    target.entries += 1;
    target.runHours += entry.hours || 0;
    target.targetBags += entry.targetBags || 0;
    target.actualBags += entry.actualBags || 0;
    target.targetKg += entry.targetKg || 0;
    target.actualKg += entry.actualKg || 0;
    target.targetPieces += entry.targetPieces || 0;
    target.actualPieces += entry.actualPieces || 0;
    if (entry.cycleTime != null) {
      target.cycleTotal += entry.cycleTime;
      target.cycleCount += 1;
    }
    if (entry.status !== "idle") {
      target.checked += 1;
      target[entry.status] += 1;
    }
  }

  function blankSummary() {
    return {
      entries: 0,
      checked: 0,
      ok: 0,
      under: 0,
      over: 0,
      runHours: 0,
      targetBags: 0,
      actualBags: 0,
      targetKg: 0,
      actualKg: 0,
      targetPieces: 0,
      actualPieces: 0,
      cycleTotal: 0,
      cycleCount: 0
    };
  }

  function finish(summary) {
    summary.varianceBags = summary.actualBags - summary.targetBags;
    summary.varianceKg = summary.actualKg - summary.targetKg;
    summary.efficiency = summary.targetBags > 0 ? summary.actualBags / summary.targetBags * 100 : null;
    summary.averageCycle = summary.cycleCount ? summary.cycleTotal / summary.cycleCount : null;
    summary.kgPerHour = summary.runHours > 0 ? summary.actualKg / summary.runHours : null;
    summary.flagged = summary.under + summary.over;
    return summary;
  }

  function grouped(entries, key) {
    var map = new Map();
    var caseMap = new Map();
    entries.forEach(function (entry) {
      var label = entry[key];
      if (key === "item" && typeof label === "string") {
        var normalized = normalizeItemName(label);
        if (!caseMap.has(normalized)) {
          caseMap.set(normalized, label);
        }
        label = caseMap.get(normalized);
      }
      if (!map.has(label)) map.set(label, Object.assign({ label: label }, blankSummary()));
      add(map.get(label), entry);
    });
    return Array.from(map.values()).map(finish).sort(function (a, b) {
      return b.actualKg - a.actualKg || b.runHours - a.runHours || a.label.localeCompare(b.label);
    });
  }

  function groupedPair(entries, leftKey, rightKey) {
    var map = new Map();
    var caseMap = new Map();
    entries.forEach(function (entry) {
      var left = entry[leftKey];
      var right = entry[rightKey];
      if (rightKey === "item" && typeof right === "string") {
        var normalized = normalizeItemName(right);
        if (!caseMap.has(normalized)) {
          caseMap.set(normalized, right);
        }
        right = caseMap.get(normalized);
      }
      var key = left + "\u0001" + right;
      if (!map.has(key)) {
        map.set(key, Object.assign({ machine: left, item: right, label: left + " / " + right }, blankSummary()));
      }
      add(map.get(key), entry);
    });
    return Array.from(map.values()).map(finish).sort(function (a, b) {
      return a.machine.localeCompare(b.machine) || b.actualKg - a.actualKg || a.item.localeCompare(b.item);
    });
  }

  function distinctItemsForMachine(summary, machineLabel) {
    return summary.machineProducts
      .filter(function (row) { return row.machine === machineLabel; })
      .sort(function (a, b) { return b.actualKg - a.actualKg; });
  }

  function firstRemarks(entries, machineLabel) {
    return entries
      .filter(function (entry) { return entry.machine === machineLabel && entry.remark; })
      .map(function (entry) { return entry.remark; })
      .filter(function (remark, index, all) { return all.indexOf(remark) === index; })
      .slice(0, 2);
  }

  function machineInsights(summary) {
    var machines = summary.machines || [];
    if (!machines.length) return [];
    var topOutput = machines[0];
    var topRuntime = machines.slice().sort(function (a, b) { return b.runHours - a.runHours; })[0];
    var avgRate = summary.kgPerHour;
    var avgEfficiency = summary.efficiency;
    return machines.map(function (machine, index) {
      var productRows = distinctItemsForMachine(summary, machine.label);
      var topProduct = productRows[0];
      var shortRunCount = summary.entriesList.filter(function (entry) {
        return entry.machine === machine.label && entry.hours != null && entry.hours < 5;
      }).length;
      var reasons = [];
      if (index === 0) {
        reasons.push("Highest output machine this week; use it as the comparison point.");
      } else if (topOutput && topOutput.actualKg > machine.actualKg) {
        reasons.push("Output is " + fmt(topOutput.actualKg - machine.actualKg, 1) + " kg below " + topOutput.label + ".");
      }
      if (topRuntime && topRuntime.runHours > 0 && machine.runHours < topRuntime.runHours * 0.75) {
        reasons.push("Lower running time: " + fmt(machine.runHours, 1) + " hr vs " + fmt(topRuntime.runHours, 1) + " hr on " + topRuntime.label + ".");
      }
      if (avgRate != null && machine.kgPerHour != null && machine.kgPerHour < avgRate * 0.9) {
        reasons.push("Lower output speed: " + fmt(machine.kgPerHour, 1) + " kg/hr vs weekly average " + fmt(avgRate, 1) + " kg/hr.");
      }
      if (avgEfficiency != null && machine.efficiency != null && machine.efficiency < Math.min(95, avgEfficiency - 3)) {
        reasons.push("Target attainment is weaker at " + fmt(machine.efficiency, 1) + "% vs weekly " + fmt(avgEfficiency, 1) + "%.");
      }
      if (machine.under > 0) {
        reasons.push(fmt(machine.under, 0) + " run(s) were under the bag target tolerance.");
      }
      if (shortRunCount > 0) {
        reasons.push(fmt(shortRunCount, 0) + " short/partial run(s) below 5 hours reduced utilization.");
      }
      if (productRows.length > 1) {
        reasons.push("Produced " + fmt(productRows.length, 0) + " item types; product changes can reduce steady runtime.");
      }
      firstRemarks(summary.entriesList, machine.label).forEach(function (remark) {
        reasons.push("Recorded note: " + remark);
      });
      if (!reasons.length) {
        reasons.push("Performance is broadly in line with peers on the available data.");
      }
      return {
        machine: machine.label,
        rank: index + 1,
        runs: machine.entries,
        runHours: machine.runHours,
        actualKg: machine.actualKg,
        kgPerHour: machine.kgPerHour,
        efficiency: machine.efficiency,
        shortRunCount: shortRunCount,
        topProduct: topProduct ? topProduct.item : "-",
        productCount: productRows.length,
        outputGapKg: topOutput ? topOutput.actualKg - machine.actualKg : 0,
        reasons: reasons.slice(0, 4)
      };
    });
  }

  function computeMouldAnalysis(sheets, periodStart, periodEnd, shiftFilter) {
    var sortedSheets = (Array.isArray(sheets) ? sheets : [])
      .filter(function (s) { return s && s.date; })
      .slice()
      .sort(function (a, b) { return a.date.localeCompare(b.date); });

    var allLines = [];
    sortedSheets.forEach(function (sheet) {
      if (Array.isArray(sheet.lines)) {
        var sortedLines = sheet.lines
          .filter(lineHasContent)
          .slice()
          .sort(function (a, b) {
            var shiftA = String(a.shift || "A").trim().toUpperCase();
            var shiftB = String(b.shift || "A").trim().toUpperCase();
            return shiftA.localeCompare(shiftB);
          });
        sortedLines.forEach(function (line) {
          allLines.push(Object.assign({}, line, { date: sheet.date }));
        });
      }
    });

    var machineLines = {};
    allLines.forEach(function (line) {
      var shift = line.shift || "A";
      if (shiftFilter && shiftFilter !== "total" && shift !== shiftFilter) {
        return;
      }
      var mName = normalizeMachineName(line.machine);
      if (!machineLines[mName]) {
        machineLines[mName] = [];
      }
      machineLines[mName].push(line);
    });

    var allMouldRuns = [];
    Object.keys(machineLines).forEach(function (mName) {
      var lines = machineLines[mName];
      var currentRun = null;

      lines.forEach(function (line) {
        var normItem = normalizeItemName(line.item);
        var runHours = num(line.hours) || 0;
        var actualBags = num(line.actualBags) || 0;
        var kgPerBag = num(line.kgPerBag) || 0;
        var actualKg = actualBags * kgPerBag;

        if (!currentRun) {
          currentRun = {
            machine: mName,
            item: line.item || "Unspecified item",
            normalizedItem: normItem,
            startDate: line.date,
            startShift: line.shift || "A",
            endDate: line.date,
            endShift: line.shift || "A",
            runHours: runHours,
            actualBags: actualBags,
            actualKg: actualKg,
            entriesCount: 1
          };
        } else {
          if (normItem === currentRun.normalizedItem) {
            currentRun.endDate = line.date;
            currentRun.endShift = line.shift || "A";
            currentRun.runHours += runHours;
            currentRun.actualBags += actualBags;
            currentRun.actualKg += actualKg;
            currentRun.entriesCount += 1;
          } else {
            currentRun.changeDate = line.date;
            currentRun.changeShift = line.shift || "A";
            currentRun.nextItem = line.item || "Unspecified item";
            allMouldRuns.push(currentRun);

            currentRun = {
              machine: mName,
              item: line.item || "Unspecified item",
              normalizedItem: normItem,
              startDate: line.date,
              startShift: line.shift || "A",
              endDate: line.date,
              endShift: line.shift || "A",
              runHours: runHours,
              actualBags: actualBags,
              actualKg: actualKg,
              entriesCount: 1
            };
          }
        }
      });

      if (currentRun) {
        currentRun.changeDate = null;
        currentRun.changeShift = null;
        currentRun.nextItem = null;
        allMouldRuns.push(currentRun);
      }
    });

    var periodRuns = allMouldRuns.filter(function (run) {
      var runStart = run.startDate;
      var runEnd = run.changeDate || run.endDate;
      return runStart <= periodEnd && runEnd >= periodStart;
    });

    var completedRuns = periodRuns.filter(function (run) {
      return run.changeDate && run.changeDate >= periodStart && run.changeDate <= periodEnd;
    });

    var totalChanges = completedRuns.length;
    var totalDays = 0;
    var totalHours = 0;
    var totalBags = 0;
    var totalKg = 0;

    completedRuns.forEach(function (run) {
      var dStart = new Date(run.startDate + "T00:00:00");
      var dEnd = new Date(run.changeDate + "T00:00:00");
      var diffDays = Math.ceil(Math.abs(dEnd - dStart) / (1000 * 60 * 60 * 24));
      run.calendarDays = diffDays;
      totalDays += diffDays;
      totalHours += run.runHours;
      totalBags += run.actualBags;
      totalKg += run.actualKg;
    });

    var avgCalendarDays = totalChanges ? totalDays / totalChanges : 0;
    var avgRunHours = totalChanges ? totalHours / totalChanges : 0;
    var avgBagsBeforeChange = totalChanges ? totalBags / totalChanges : 0;
    var avgKgBeforeChange = totalChanges ? totalKg / totalChanges : 0;

    periodRuns.sort(function (a, b) {
      return a.machine.localeCompare(b.machine) || a.startDate.localeCompare(b.startDate);
    });

    return {
      periodRuns: periodRuns,
      completedRuns: completedRuns,
      totalChanges: totalChanges,
      avgCalendarDays: avgCalendarDays,
      avgRunHours: avgRunHours,
      avgBagsBeforeChange: avgBagsBeforeChange,
      avgKgBeforeChange: avgKgBeforeChange
    };
  }

  function summarizeLines(lines, tolerance) {
    var entries = (Array.isArray(lines) ? lines : [])
      .filter(lineHasContent)
      .map(function (line) { return computeLine(line, tolerance); });
    var totals = blankSummary();
    entries.forEach(function (entry) { add(totals, entry); });
    finish(totals);
    totals.items = grouped(entries, "item");
    totals.machines = grouped(entries, "machine");
    totals.machineProducts = groupedPair(entries, "machine", "item");
    totals.itemCount = totals.items.length;
    totals.machineCount = totals.machines.length;
    totals.remarks = entries.filter(function (entry) { return entry.remark; });
    totals.flaggedEntries = entries.filter(function (entry) { return entry.status === "under" || entry.status === "over"; });
    totals.shortRuns = entries.filter(function (entry) { return entry.hours != null && entry.hours < 5; });
    totals.entriesList = entries;
    totals.machineInsights = machineInsights(totals);
    return totals;
  }

  function summarizeSheet(sheet, shiftFilter) {
    var lines = sheet && sheet.lines || [];
    if (shiftFilter && shiftFilter !== "total") {
      lines = lines.filter(function (l) {
        return (l.shift || "A") === shiftFilter;
      });
    }
    var totals = summarizeLines(lines, 5);
    totals.date = sheet && sheet.date || "";
    totals.shiftLabel = shiftLabel(shiftFilter);
    totals.title = "Daily production report";
    totals.subtitle = formatDate(totals.date);
    totals.dayCount = totals.entries ? 1 : 0;
    return totals;
  }

  function summarizeWeek(sheets, start, shiftFilter) {
    var weekSheets = (Array.isArray(sheets) ? sheets : []).filter(function (sheet) {
      return sheet && sheet.date && weekStart(sheet.date) === start && Array.isArray(sheet.lines) && sheet.lines.some(lineHasContent);
    });
    var lines = [];
    var shiftALines = [];
    var shiftBLines = [];
    weekSheets.forEach(function (sheet) {
      sheet.lines.forEach(function (line) {
        if (lineHasContent(line)) {
          var lineWithDate = Object.assign({}, line, { date: sheet.date });
          var shift = line.shift || "A";
          if (shift === "A") {
            shiftALines.push(lineWithDate);
          } else if (shift === "B") {
            shiftBLines.push(lineWithDate);
          }
          if (!shiftFilter || shiftFilter === "total" || shift === shiftFilter) {
            lines.push(lineWithDate);
          }
        }
      });
    });
    var totals = summarizeLines(lines, 5);
    totals.shiftA = summarizeLines(shiftALines, 5);
    totals.shiftB = summarizeLines(shiftBLines, 5);
    
    var endDate = new Date(start + "T12:00:00");
    endDate.setDate(endDate.getDate() + 6);
    totals.start = start;
    totals.end = localDateISO(endDate);
    totals.date = start;
    totals.shiftLabel = shiftLabel(shiftFilter);
    totals.title = "Weekly production report";
    totals.subtitle = formatDate(start) + " to " + formatDate(totals.end);
    totals.mouldAnalysis = computeMouldAnalysis(sheets, start, totals.end, shiftFilter);
    
    var activeWeekSheets = weekSheets.filter(function (sheet) {
      return sheet.lines.some(function (l) {
        return lineHasContent(l) && (!shiftFilter || shiftFilter === "total" || (l.shift || "A") === shiftFilter);
      });
    });
    totals.dayCount = activeWeekSheets.length;
    totals.days = activeWeekSheets.map(function (sheet) {
      return summarizeSheet(sheet, shiftFilter);
    }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    return totals;
  }

  function summarizeMonth(sheets, start, shiftFilter) {
    var monthSheets = (Array.isArray(sheets) ? sheets : []).filter(function (sheet) {
      return sheet && sheet.date && monthStart(sheet.date) === start && Array.isArray(sheet.lines) && sheet.lines.some(lineHasContent);
    });
    var lines = [];
    var shiftALines = [];
    var shiftBLines = [];
    monthSheets.forEach(function (sheet) {
      sheet.lines.forEach(function (line) {
        if (lineHasContent(line)) {
          var lineWithDate = Object.assign({}, line, { date: sheet.date });
          var shift = line.shift || "A";
          if (shift === "A") {
            shiftALines.push(lineWithDate);
          } else if (shift === "B") {
            shiftBLines.push(lineWithDate);
          }
          if (!shiftFilter || shiftFilter === "total" || shift === shiftFilter) {
            lines.push(lineWithDate);
          }
        }
      });
    });
    var totals = summarizeLines(lines, 5);
    totals.shiftA = summarizeLines(shiftALines, 5);
    totals.shiftB = summarizeLines(shiftBLines, 5);
    
    var parts = start.split("-");
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var endDate = new Date(year, month, 0);
    totals.start = start;
    totals.end = localDateISO(endDate);
    totals.date = start;
    totals.shiftLabel = shiftLabel(shiftFilter);
    totals.title = "Monthly production report";
    
    var dateObj = new Date(start + "T12:00:00");
    totals.subtitle = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    totals.mouldAnalysis = computeMouldAnalysis(sheets, start, totals.end, shiftFilter);
    
    var activeMonthSheets = monthSheets.filter(function (sheet) {
      return sheet.lines.some(function (l) {
        return lineHasContent(l) && (!shiftFilter || shiftFilter === "total" || (l.shift || "A") === shiftFilter);
      });
    });
    totals.dayCount = activeMonthSheets.length;
    totals.days = activeMonthSheets.map(function (sheet) {
      return summarizeSheet(sheet, shiftFilter);
    }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    return totals;
  }

  function signed(value, digits) {
    if (value == null || !Number.isFinite(value)) return "-";
    return (value > 0 ? "+" : "") + fmt(value, digits);
  }

  function kpi(label, value, note, tone) {
    return '<div class="report-kpi ' + esc(tone || "") + '">' +
      '<span>' + esc(label) + '</span>' +
      '<strong>' + esc(value) + '</strong>' +
      '<small>' + esc(note || "") + '</small>' +
      '</div>';
  }

  function table(headers, rows, emptyText) {
    if (!rows.length) return '<div class="report-empty">' + esc(emptyText || "No data available.") + '</div>';
    return '<div class="table-wrap"><table class="report-table"><thead><tr>' +
      headers.map(function (header) { return "<th>" + esc(header) + "</th>"; }).join("") +
      '</tr></thead><tbody>' +
      rows.map(function (row) {
        return "<tr>" + row.map(function (cell) { return "<td>" + cell + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table></div>";
  }

  function summaryKpis(summary) {
    var efficiencyTone = summary.efficiency == null ? "" : summary.efficiency >= 95 ? "positive" : "negative";
    return [
      kpi("Target attainment", summary.efficiency == null ? "-" : fmt(summary.efficiency, 1) + "%", signed(summary.varianceKg, 1) + " kg vs plan", efficiencyTone),
      kpi("Machine runtime", fmt(summary.runHours, 1) + " hr", fmt(summary.machineCount, 0) + " machine(s) logged", ""),
      kpi("Product coverage", fmt(summary.itemCount, 0) + " types", fmt(summary.entries, 0) + " production run(s)", ""),
      kpi("Needs action", fmt(summary.flagged + summary.shortRuns.length, 0), fmt(summary.flagged, 0) + " off-target / " + fmt(summary.shortRuns.length, 0) + " short run(s)", summary.flagged || summary.shortRuns.length ? "negative" : "positive")
    ].join("");
  }

  function itemRows(summary) {
    return summary.items.map(function (item) {
      return [
        esc(item.label),
        esc(fmt(item.entries, 0)),
        esc(fmt(item.runHours, 1)),
        esc(fmt(item.actualBags, 0)),
        esc(fmt(item.actualKg, 1)),
        esc(summary.actualKg ? fmt(item.actualKg / summary.actualKg * 100, 1) + "%" : "-"),
        esc(item.efficiency == null ? "-" : fmt(item.efficiency, 1) + "%")
      ];
    });
  }

  function machineRows(summary) {
    return summary.machines.map(function (machine) {
      return [
        esc(machine.label),
        esc(fmt(machine.entries, 0)),
        esc(fmt(machine.runHours, 1)),
        esc(fmt(machine.actualBags, 0)),
        esc(fmt(machine.actualKg, 1)),
        esc(machine.kgPerHour == null ? "-" : fmt(machine.kgPerHour, 1)),
        esc(machine.efficiency == null ? "-" : fmt(machine.efficiency, 1) + "%"),
        esc(fmt(summary.entriesList.filter(function (entry) { return entry.machine === machine.label && entry.hours != null && entry.hours < 5; }).length, 0))
      ];
    });
  }

  function machineProductRows(summary) {
    return (summary.machineProducts || []).slice().sort(function (a, b) {
      return a.machine.localeCompare(b.machine) || b.actualKg - a.actualKg || a.item.localeCompare(b.item);
    }).map(function (row) {
      return [
        esc(row.machine),
        esc(row.item),
        esc(fmt(row.entries, 0)),
        esc(fmt(row.runHours, 1)),
        esc(fmt(row.actualBags, 0)),
        esc(fmt(row.actualKg, 1)),
        esc(row.kgPerHour == null ? "-" : fmt(row.kgPerHour, 1)),
        esc(row.efficiency == null ? "-" : fmt(row.efficiency, 1) + "%")
      ];
    });
  }

  function insightCards(summary) {
    var insights = (summary.machineInsights || []).filter(function (insight) {
      return insight.rank > 1 || insight.shortRunCount || (insight.efficiency != null && insight.efficiency < 95);
    });
    if (!insights.length) {
      insights = (summary.machineInsights || []).slice(0, 3);
    }
    return insights.slice(0, 6).map(function (insight) {
      var tone = insight.rank === 1 ? "strong" : insight.efficiency != null && insight.efficiency < 95 ? "watch" : "";
      return '<div class="insight-card ' + esc(tone) + '">' +
        '<div class="insight-card-head"><strong>' + esc(insight.machine) + '</strong><span>Rank ' + esc(fmt(insight.rank, 0)) + '</span></div>' +
        '<div class="insight-metrics">' +
        '<span><b>' + esc(fmt(insight.runHours, 1)) + '</b> hr</span>' +
        '<span><b>' + esc(fmt(insight.actualKg, 1)) + '</b> kg</span>' +
        '<span><b>' + esc(insight.kgPerHour == null ? "-" : fmt(insight.kgPerHour, 1)) + '</b> kg/hr</span>' +
        '<span><b>' + esc(insight.efficiency == null ? "-" : fmt(insight.efficiency, 1) + "%") + '</b> target</span>' +
        '</div>' +
        '<p>Primary product: ' + esc(insight.topProduct) + (insight.productCount > 1 ? " plus " + esc(fmt(insight.productCount - 1, 0)) + " other item(s)." : ".") + '</p>' +
        '<ul>' + insight.reasons.map(function (reason) { return '<li>' + esc(reason) + '</li>'; }).join("") + '</ul>' +
        '</div>';
    }).join("");
  }

  function mouldChangeRows(analysis) {
    if (!analysis || !analysis.periodRuns || !analysis.periodRuns.length) return [];
    return analysis.periodRuns.map(function (run) {
      var dStart = new Date(run.startDate + "T00:00:00");
      var dEnd = new Date((run.changeDate || run.endDate) + "T00:00:00");
      var diffDays = Math.ceil(Math.abs(dEnd - dStart) / (1000 * 60 * 60 * 24));
      var durationStr = (diffDays === 0 ? "Same day" : diffDays + " day" + (diffDays > 1 ? "s" : "")) + " (" + fmt(run.runHours, 1) + " hr)";

      var statusHtml;
      if (run.changeDate) {
        statusHtml = '<span class="mould-statusbadge badge-changed">Changed</span><div class="next-item-sub">Next: ' + esc(run.nextItem) + '</div>';
      } else {
        statusHtml = '<span class="mould-statusbadge badge-active">Active</span><div class="next-item-sub">Current mould</div>';
      }

      var outputStr = fmt(run.actualBags, 0) + " bags (" + fmt(run.actualKg, 1) + " kg)";
      var rangeStr = formatDate(run.startDate) + " to " + (run.changeDate ? formatDate(run.changeDate) : "Present");

      return [
        esc(run.machine),
        esc(run.item),
        esc(rangeStr),
        esc(durationStr),
        esc(outputStr),
        statusHtml
      ];
    });
  }

  function dayRows(summary) {
    return (summary.days || []).map(function (day) {
      return [
        esc(formatDate(day.date)),
        esc(fmt(day.entries, 0)),
        esc(fmt(day.runHours, 1)),
        esc(fmt(day.actualBags, 0)),
        esc(fmt(day.actualKg, 1)),
        esc(day.efficiency == null ? "-" : fmt(day.efficiency, 1) + "%"),
        esc(fmt(day.flagged, 0))
      ];
    });
  }

  function reportHtml(summary, options) {
    options = options || {};
    if (!summary || !summary.entries) {
      return '<div class="report-empty large"><strong>No production data yet</strong><span>Logs appear here automatically as runs are entered.</span></div>';
    }
    var scope = options.scope || "day";
    var heading = '<div class="report-hero">' +
      '<div><span class="eyebrow">' + esc(scope === "weekly" ? "Weekly intelligence" : scope === "monthly" ? "Monthly intelligence" : "Daily intelligence") + '</span>' +
      '<h2>' + esc(summary.title) + '</h2><p>' + esc(summary.subtitle) + '</p></div>' +
      '<div class="report-hero-stat"><span>' + esc(summary.shiftLabel || "All shifts") + '</span><strong>' + esc(fmt(summary.actualKg, 1)) + ' kg</strong><small>' + esc(fmt(summary.actualBags, 0)) + ' bags</small></div>' +
      '</div>';
    var daySection = (scope === "weekly" || scope === "monthly")
      ? '<section class="report-block trend-section"><div class="section-heading"><div><span class="eyebrow">Daily trend</span><h3>Production by date</h3></div></div>' +
        table(["Date", "Entries", "Run hr", "Actual bags", "Actual kg", "Efficiency", "Follow-up"], dayRows(summary), "No dated entries.") +
        "</section>"
      : "";
    var issues = summary.flaggedEntries.map(function (entry) {
      return '<div class="issue-row ' + esc(entry.status) + '"><div><strong>' + esc(entry.machine) + ' / ' + esc(entry.item) + '</strong><span>' +
        esc(statusWord(entry.status)) + ' | ' + esc(signed(entry.varianceBags, 1)) + ' bags | ' +
        esc(entry.efficiency == null ? "-" : fmt(entry.efficiency, 1) + "% efficiency") +
        '</span></div><small>' + esc(entry.remark || "No reason recorded") + "</small></div>";
    }).join("");
    var shortRuns = summary.shortRuns.map(function (entry) {
      return '<div class="issue-row short"><div><strong>' + esc(entry.machine) + ' / ' + esc(entry.item) + '</strong><span>' +
        esc(fmt(entry.hours, 1)) + ' hr run | ' + esc(fmt(entry.actualKg, 1)) + ' kg output</span></div><small>' + esc(entry.remark || "Check whether this was a changeover, stoppage or partial run.") + '</small></div>';
    }).join("");
    var topMachine = summary.machines[0];
    var topItem = summary.items[0];
    var decisions = '<section class="report-block decisions-section"><div class="section-heading"><div><span class="eyebrow">Management view</span><h3>Operational summary</h3></div></div>' +
      '<div class="decision-grid">' +
      '<div><strong>' + esc(topMachine ? topMachine.label : "-") + '</strong><span>Highest output machine' + (topMachine ? " | " + esc(fmt(topMachine.actualKg, 1)) + " kg" : "") + '</span></div>' +
      '<div><strong>' + esc(topItem ? topItem.label : "-") + '</strong><span>Largest product output' + (topItem ? " | " + esc(fmt(topItem.actualKg, 1)) + " kg" : "") + '</span></div>' +
      '<div><strong>' + esc(fmt(summary.shortRuns.length, 0)) + '</strong><span>Runs below 5 hours to review</span></div>' +
      '<div><strong>' + esc(fmt(summary.flagged, 0)) + '</strong><span>Runs outside the ±1.5 bags tolerance</span></div>' +
      "</div></section>";

    var chartSection = "";
    var shiftSection = "";
    var insightSection = "";
    var machineProductSection = "";
    var mouldChangeSection = "";
    if (scope === "weekly" || scope === "monthly") {
      var scopeLabel = scope === "weekly" ? "Weekly" : "Monthly";
      chartSection = '<section class="report-block charts-section">' +
        '<div class="section-heading"><div><span class="eyebrow">Visual Analytics</span>   <h3>' + scopeLabel + ' Charts & Performance</h3></div></div>' +
        '<div class="charts-grid">' +
        '  <div class="chart-container line-chart-container">' +
        '    <h4>Daily Production Trend (kg)</h4>' +
        '    <div class="canvas-wrapper"><canvas id="' + scope + 'DailyTrendChart"></canvas></div>' +
        '  </div>' +
        (scope !== "monthly" ?
        '  <div class="chart-container line-chart-container product-detail-chart">' +
        '    <h4>Product Output Detail (kg)</h4>' +
        '    <div class="canvas-wrapper detail"><canvas id="' + scope + 'ProductMixChart"></canvas></div>' +
        '  </div>' : '') +
        '  <div class="chart-container bar-chart-container">' +
        '    <h4>Machine Performance (kg)</h4>' +
        '    <div class="canvas-wrapper"><canvas id="' + scope + 'MachinePerformanceChart"></canvas></div>' +
        '  </div>' +
        '  <div class="chart-container bar-chart-container">' +
        '    <h4>Machine Runtime (hours)</h4>' +
        '    <div class="canvas-wrapper"><canvas id="' + scope + 'MachineRuntimeChart"></canvas></div>' +
        '  </div>' +
        '  <div class="chart-container bar-chart-container">' +
        '    <h4>Machine Target Attainment (%)</h4>' +
        '    <div class="canvas-wrapper"><canvas id="' + scope + 'MachineEfficiencyChart"></canvas></div>' +
        '  </div>' +
        '  <div class="chart-container line-chart-container">' +
        '    <h4>Machine Product Mix (kg, all products)</h4>' +
        '    <div class="canvas-wrapper extra-tall"><canvas id="' + scope + 'MachineProductChart"></canvas></div>' +
        '  </div>' +
        '</div>' +
        '</section>';

      insightSection = '<section class="report-block insights-section"><div class="section-heading"><div><span class="eyebrow">Machine diagnostics</span><h3>Why machines underperformed</h3></div><span class="section-note">Compared by output, runtime, kg/hr and target attainment</span></div>' +
        '<div class="insight-grid">' + (insightCards(summary) || '<div class="report-empty">No machine gaps to explain.</div>') + '</div>' +
        '</section>';

      machineProductSection = '<section class="report-block machine-product-section"><div class="section-heading"><div><span class="eyebrow">Machine x Product</span><h3>What each machine produced</h3></div><span class="section-note">' +
        esc(fmt((summary.machineProducts || []).length, 0)) + ' machine-product combination(s)</span></div>' +
        table(["Machine / line", "Product", "Runs", "Run hr", "Bags", "Actual kg", "Kg / hr", "Attainment"], machineProductRows(summary), "No machine-product breakdown.") +
        "</section>";

      var sa = summary.shiftA || blankSummary();
      var sb = summary.shiftB || blankSummary();

      shiftSection = '<section class="report-block shift-metrics-section">' +
        '<div class="section-heading"><div><span class="eyebrow">Shift Performance</span><h3>Shift-wise ' + scopeLabel + ' Comparison</h3></div></div>' +
        '<div class="shift-comparison-grid">' +
        '  <div class="shift-card shift-a-card">' +
        '    <div class="shift-card-header">' +
        '      <h4>Shift A</h4>' +
        '    </div>' +
        '    <div class="shift-card-body">' +
        '      <div class="shift-kpi"><span>Production</span><strong>' + fmt(sa.actualKg, 1) + ' kg</strong><small>' + fmt(sa.actualBags, 0) + ' bags</small></div>' +
        '      <div class="shift-kpi"><span>Runtime</span><strong>' + fmt(sa.runHours, 1) + ' hr</strong><small>' + fmt(sa.entries, 0) + ' runs</small></div>' +
        '      <div class="shift-kpi"><span>Efficiency</span><strong class="' + (sa.efficiency >= 95 ? 'positive' : sa.efficiency > 0 ? 'negative' : '') + '">' + (sa.efficiency == null ? "-" : fmt(sa.efficiency, 1) + "%") + '</strong><small>vs target</small></div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="shift-card shift-b-card">' +
        '    <div class="shift-card-header">' +
        '      <h4>Shift B</h4>' +
        '    </div>' +
        '    <div class="shift-card-body">' +
        '      <div class="shift-kpi"><span>Production</span><strong>' + fmt(sb.actualKg, 1) + ' kg</strong><small>' + fmt(sb.actualBags, 0) + ' bags</small></div>' +
        '      <div class="shift-kpi"><span>Runtime</span><strong>' + fmt(sb.runHours, 1) + ' hr</strong><small>' + fmt(sb.entries, 0) + ' runs</small></div>' +
        '      <div class="shift-kpi"><span>Efficiency</span><strong class="' + (sb.efficiency >= 95 ? 'positive' : sb.efficiency > 0 ? 'negative' : '') + '">' + (sb.efficiency == null ? "-" : fmt(sb.efficiency, 1) + "%") + '</strong><small>vs target</small></div>' +
        '    </div>' +
        '  </div>' +
        '</div>' +
        '</section>';

      var ma = summary.mouldAnalysis;
      var mouldKpisHtml = "";
      if (ma) {
        var avgDur = ma.totalChanges 
          ? ma.avgCalendarDays.toFixed(1) + " days (" + fmt(ma.avgRunHours, 1) + " hr)"
          : "-";
        var avgOut = ma.totalChanges 
          ? fmt(ma.avgBagsBeforeChange, 0) + " bags (" + fmt(ma.avgKgBeforeChange, 1) + " kg)"
          : "-";
        
        mouldKpisHtml = '<div class="report-kpis mould-kpis-grid">' +
          kpi("Mould Changes Completed", ma.totalChanges + " changeover(s)", "In selected period", "") +
          kpi("Average Mould Life", avgDur, "Run time before change", "") +
          kpi("Average Run Output", avgOut, "Bags / weight before change", "") +
          '</div>';
      }

      mouldChangeSection = '<section class="report-block mould-analysis-section">' +
        '<div class="section-heading"><div><span class="eyebrow">Mould Analytics</span><h3>Mould Change & Run Analysis</h3></div>' +
        '<span class="section-note">' + esc(ma ? ma.periodRuns.length : 0) + ' active/completed run(s) analyzed</span></div>' +
        mouldKpisHtml +
        table(["Machine / line", "Mould / Item", "Run Period", "Run Duration", "Production Output", "Status"], mouldChangeRows(ma), "No mould runs recorded in this period.") +
        '</section>';
    }

    var exceptionsHtml = "";
    var shortRunsHtml = "";
    if (scope !== "weekly" && scope !== "monthly") {
      exceptionsHtml = '<section class="report-block exceptions-section' + (summary.flagged === 0 ? ' empty-print' : '') + '"><div class="section-heading"><div><span class="eyebrow">Exceptions</span><h3>Follow-up list</h3></div><span class="section-note">' +
        esc(fmt(summary.flagged, 0)) + ' flagged line(s)</span></div>' +
        (issues || '<div class="report-empty">No under-target or over-target runs.</div>') +
        "</section>";
      shortRunsHtml = '<section class="report-block short-runs-section' + (summary.shortRuns.length === 0 ? ' empty-print' : '') + '"><div class="section-heading"><div><span class="eyebrow">Continuity</span><h3>Short runs below 5 hours</h3></div><span class="section-note">' +
        esc(fmt(summary.shortRuns.length, 0)) + ' short run(s)</span></div>' +
        (shortRuns || '<div class="report-empty">No short runs recorded.</div>') +
        "</section>";
    }

    return heading +
      '<div class="report-kpis">' + summaryKpis(summary) + "</div>" +
      decisions +
      chartSection +
      shiftSection +
      insightSection +
      daySection +
      '<section class="report-block mix-section"><div class="section-heading"><div><span class="eyebrow">Product mix</span><h3>What was produced</h3></div></div>' +
      table(["Item / type", "Runs", "Run hr", "Bags", "Actual kg", "Output share", "Attainment"], itemRows(summary), "No item breakdown.") +
      "</section>" +
      '<section class="report-block machine-section"><div class="section-heading"><div><span class="eyebrow">Utilization</span><h3>Machine performance</h3></div></div>' +
      table(["Machine / line", "Runs", "Run hr", "Bags", "Actual kg", "Kg / hr", "Attainment", "Short runs"], machineRows(summary), "No machine breakdown.") +
      "</section>" +
      machineProductSection +
      mouldChangeSection +
      exceptionsHtml +
      shortRunsHtml;
  }

  window.NKPLAnalytics = {
    computeLine: computeLine,
    formatDate: formatDate,
    fmt: fmt,
    lineHasContent: lineHasContent,
    localDateISO: localDateISO,
    normalizeItemName: normalizeItemName,
    normalizeMachineName: normalizeMachineName,
    reportHtml: reportHtml,
    statusWord: statusWord,
    summarizeSheet: summarizeSheet,
    summarizeWeek: summarizeWeek,
    monthStart: monthStart,
    summarizeMonth: summarizeMonth,
    weekStart: weekStart,
    computeMouldAnalysis: computeMouldAnalysis
  };
})();
