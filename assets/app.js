  /* ── Shared maths ────────────────────────── */
  function bagsFormula(cycleTime, cavity, hours, grammage, kgPerBag) {
    return (3600 / cycleTime * cavity * hours * grammage / 1000) / kgPerBag;
  }
  function piecesFormula(cycleTime, cavity, hours) {
    return 3600 / cycleTime * cavity * hours;
  }
  function fmt(n, max) {
    if (n == null || !isFinite(n)) return "—";
    return n.toLocaleString("en-US", { maximumFractionDigits: max == null ? 2 : max });
  }
  function num(x) {
    if (x === "" || x == null) return null;
    var n = parseFloat(x); return isNaN(n) ? null : n;
  }
  function classify(actual, target, tolPct) {
    if (!(target > 0) || actual == null) return null;
    var pct = (actual - target) / target * 100;
    var delta = actual - target;
    var status = delta < -1.5 ? "under" : (delta > 1.5 ? "over" : "ok");
    return { pct: pct, delta: delta, eff: actual / target * 100, status: status };
  }
  function statusWord(s) { return s === "ok" ? "On target" : s === "under" ? "Under target" : "Over target"; }
  var Analytics = window.NKPLAnalytics;
  var FIXED_TOLERANCE = 1.5;

  function nextMachineName(value) {
    var current = String(value || "").trim();
    if (!current) return "1";
    var match = current.match(/^(.*?)(\d+)(\D*)$/);
    if (!match) return current;
    var next = String(Number(match[2]) + 1).padStart(match[2].length, "0");
    return match[1] + next + match[3];
  }

  /* ── Calculator ──────────────────────────── */
  (function () {
    var ids = ["cycleTime", "cavity", "hours", "kgPerBag"];
    var el = {};
    ids.forEach(function (id) { el[id] = document.getElementById(id); });
    var machineEl  = document.getElementById("machineName");
    var itemGrammageEl = document.getElementById("itemGrammage");
    var itemMmEl = document.getElementById("itemMm");
    var itemDescriptionEl = document.getElementById("itemDescription");
    el.grammage = itemGrammageEl;
    var calculationIds = ids.concat(["grammage"]);
    var actualEl   = document.getElementById("actualBags");
    var msg        = document.getElementById("msg");
    var targetBags = document.getElementById("targetBags");
    var targetExact= document.getElementById("targetExact");
    var targetKg   = document.getElementById("targetKg");
    var targetPieces=document.getElementById("targetPieces");
    var statPieces = document.getElementById("statPieces");
    var statRate   = document.getElementById("statRate");
    var statKgRate = document.getElementById("statKgRate");
    var disc       = document.getElementById("discPanel");
    var discStatus = document.getElementById("discStatus");
    var discDetail = document.getElementById("discDetail");
    var discLogBtn = document.getElementById("discLogBtn");
    var lastParams = null;
    var lastAutoLogKey = null;
    var autoLogTimer = null;
    var pendingAutoLogKey = null;
    var lastComputedKey = null;

    function showMsg(t) { msg.textContent = t || ""; msg.className = t ? "msg warn" : "msg"; }
    function clearOutputs() {
      targetBags.textContent = "—"; targetExact.textContent = "Bags per formula";
      targetKg.textContent = "—"; targetPieces.textContent = "Total output";
      statPieces.textContent = "—"; statRate.textContent = "—"; statKgRate.textContent = "—";
      disc.className = "disc"; lastParams = null;
    }
    function resetLogBtn() {
      discLogBtn.textContent = "Log entry ↓";
      discLogBtn.className = "disc-log-btn";
      discLogBtn.disabled = false;
    }
    function reset() {
      ids.forEach(function (id) { el[id].value = ""; });
      resetItem();
      actualEl.value = "";
      clearOutputs(); showMsg(""); resetLogBtn(); el.cycleTime.focus();
    }
    function focusCalculator() {
      try {
        var p = document.querySelector(".panel-left");
        if (p) p.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {}
      try { el.cycleTime.focus(); } catch (e) {}
    }
    function itemName() {
      var grammage = itemGrammageEl.value.trim();
      var mm = itemMmEl.value.trim();
      var description = itemDescriptionEl.value.trim();
      return [grammage ? grammage + "gm" : "", mm ? mm + "mm" : "", description].filter(Boolean).join(" ");
    }
    function syncItemGrammage() {
      calculate();
    }
    function makeLogKey(v, actual, status, tolPct) {
      return [
        machineEl.value.trim(), itemName(),
        v.cycleTime, v.cavity, v.hours, v.grammage, v.kgPerBag,
        actual, status, tolPct
      ].join("|");
    }
    function clearAutoLogTimer() {
      if (autoLogTimer) { clearTimeout(autoLogTimer); autoLogTimer = null; }
      pendingAutoLogKey = null;
    }
    function tryLogNow() {
      if (!lastParams || !window.__addToLog) return false;
      if (!lastComputedKey || lastComputedKey === lastAutoLogKey) return false;
      clearAutoLogTimer();
      lastAutoLogKey = lastComputedKey;
      window.__addToLog(lastParams);
      discLogBtn.textContent = "✓ Logged";
      discLogBtn.className = "disc-log-btn added";
      discLogBtn.disabled = true;
      discDetail.innerHTML += " · <b>Production entry logged</b>";
      return true;
    }

    function resetItem() {
      clearAutoLogTimer();
      itemGrammageEl.value = "";
      itemMmEl.value = "";
      itemDescriptionEl.value = "";
      el.grammage.value = "";
      actualEl.value = "";
      clearOutputs();
      showMsg("Enter the next item's grammage and width.");
    }
    function completeRun(hours) {
      resetItem();
      if (Number(hours) < 5) {
        showMsg("Short run logged. Keep this machine selected and enter the next line.");
        return;
      }
      machineEl.value = nextMachineName(machineEl.value);
      // Clear run parameters for the next machine
      el.cycleTime.value = "";
      el.cavity.value = "";
      el.hours.value = "";
      el.kgPerBag.value = "";
      showMsg("Logged. Enter the next item's grammage and width.");
    }

    function calculate() {
      var v = {}, anyFilled = false, missing = false;
      calculationIds.forEach(function (id) {
        var raw = el[id].value.trim();
        if (raw !== "") anyFilled = true; else missing = true;
        v[id] = parseFloat(raw); if (isNaN(v[id])) missing = true;
      });
      if (missing) { showMsg(anyFilled ? "Fill in the production parameters to see the target." : ""); clearOutputs(); return; }
      if (v.cycleTime <= 0) { showMsg("Cycle time must be greater than 0."); clearOutputs(); return; }
      if (v.kgPerBag <= 0) { showMsg("Weight per bag must be greater than 0."); clearOutputs(); return; }
      showMsg("");

      var bags = bagsFormula(v.cycleTime, v.cavity, v.hours, v.grammage, v.kgPerBag);
      var pieces = piecesFormula(v.cycleTime, v.cavity, v.hours);
      var kg = bags * v.kgPerBag;

      targetBags.textContent = Math.round(bags).toLocaleString("en-US") + " bags";
      targetExact.textContent = fmt(bags, 2) + " exact";
      targetKg.textContent = fmt(kg, 1) + " kg";
      targetPieces.textContent = fmt(pieces, 0) + " pieces";
      statPieces.textContent = fmt(pieces, 0);
      statRate.textContent = v.hours > 0 ? fmt(bags / v.hours, 1) : "—";
      statKgRate.textContent = v.hours > 0 ? fmt(kg / v.hours, 1) : "—";

      var actual = num(actualEl.value);
      var tolPct = FIXED_TOLERANCE;
      if (tolPct == null) tolPct = 5;
      var c = classify(actual, bags, tolPct);

      if (!c) { disc.className = "disc"; lastParams = null; resetLogBtn(); return; }

      disc.className = "disc show " + c.status;
      var sign = c.delta >= 0 ? "+" : "−";
      discStatus.textContent = c.status === "ok" ? "✓ On target"
        : c.status === "under" ? "▼ Under target" : "▲ Over target";
      discDetail.innerHTML =
        "Actual <b>" + fmt(actual, 0) + "</b> vs target <b>" + fmt(bags, 1) + "</b> bags · " +
        "variance <b>" + sign + fmt(Math.abs(c.delta), 1) + "</b> (" + sign + fmt(Math.abs(c.pct), 1) + "%) · " +
        "efficiency <b>" + fmt(c.eff, 0) + "%</b>";

      lastParams = { machine: machineEl.value.trim(), item: itemName(),
                     cycleTime: v.cycleTime, cavity: v.cavity, hours: v.hours,
                     grammage: v.grammage, kgPerBag: v.kgPerBag, actualBags: actual, status: c.status };
      resetLogBtn();

      clearAutoLogTimer();
      lastComputedKey = null;
      if (window.__addToLog) {
        var key = makeLogKey(v, actual, c.status, tolPct);
        lastComputedKey = key;
      }
    }

    discLogBtn.addEventListener("click", function () {
      tryLogNow();
    });

    document.getElementById("resetBtn").addEventListener("click", reset);
    
    ids.concat(["actualBags"]).forEach(function (id) {
      var node = id === "actualBags" ? actualEl : el[id];
      node.addEventListener("input", calculate);
      node.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        calculate();
        if (id === "actualBags") tryLogNow();
      });
    });
    machineEl.addEventListener("input", calculate);
    machineEl.addEventListener("blur", function () {
      var norm = Analytics.normalizeMachineName(machineEl.value);
      machineEl.value = norm === "Unassigned machine" ? "" : norm;
      calculate();
    });
    itemGrammageEl.addEventListener("input", syncItemGrammage);
    itemMmEl.addEventListener("input", calculate);
    itemDescriptionEl.addEventListener("input", calculate);
    window.__recalcCalculator = calculate;
    window.__resetCalculator = reset;
    window.__focusCalculator = focusCalculator;
    window.__resetCalculatorItem = resetItem;
    window.__completeCalculatorRun = completeRun;
  })();

  /* ── Shift Production Check ──────────────── */
  (function () {
    var LS_LINES = "nkpl_lines_v2", LS_DATE = "nkpl_date_v2", LS_INDEX = "nkpl_index_v1";
    var linesEl    = document.getElementById("lines");
    var emptyState = document.getElementById("emptyState");
    var summary    = document.getElementById("summary");
    var sumLine    = document.getElementById("sumLine");
    var sumTotals  = document.getElementById("sumTotals");
    var dateEl     = document.getElementById("reportDate");
    var phSub      = document.getElementById("phSub");
    var syncState  = document.getElementById("syncState");
    var syncTimer = null;
    var activeDate = "";
    var historySheets = [];
    var selectedDailyDate = "";
    var selectedWeekStart = "";
    var activeShiftFilter = "A";
    var selectedDailyShift = "total";
    var selectedWeeklyShift = "total";

    var FIELDS = [
      { f: "cycleTime", label: "Cycle s" },
      { f: "cavity",    label: "Cavity"  },
      { f: "hours",     label: "Hours"   },
      { f: "grammage",  label: "Gram g"  },
      { f: "kgPerBag",  label: "Kg/bag"  }
    ];

    var lines = [];
    function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function emptyLine() { return { id:uid(), machine:"", shift:"A", item:"", cycleTime:"", cavity:"", hours:"", grammage:"", kgPerBag:"", actualBags:"", remark:"", _fromCalc:false }; }
    function sheetKey(date) { return LS_LINES + ":" + (date || "today"); }
    function localLinesKey(date) { return sheetKey(date || activeDate || dateEl.value); }
    function cloneLine(line) { return Object.assign(emptyLine(), line || {}); }
    function lineHasContent(line) {
      return Analytics.lineHasContent(line);
    }
    function sheetHasContent(lines) {
      return Array.isArray(lines) && lines.some(lineHasContent);
    }
    function currentSheetPayload(date) {
      return {
        date: date || activeDate || dateEl.value,
        lines: normalizeLines(lines),
        tolerance: tol(),
        updatedAt: new Date().toISOString()
      };
    }
    function parseStoredSheet(raw) {
      if (!raw) return null;
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return { lines: parsed };
        if (parsed && typeof parsed === "object") return parsed;
      } catch (e) {}
      return null;
    }
    function normalizeLines(lines) {
      return (Array.isArray(lines) ? lines : []).map(cloneLine);
    }
    function localIndexKey() { return LS_INDEX; }
    function readLocalIndex() {
      try {
        var raw = localStorage.getItem(localIndexKey());
        if (!raw) return [];
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(date || ""); }) : [];
      } catch (e) { return []; }
    }
    function writeLocalIndex(dates) {
      try {
        var next = Array.from(new Set((dates || []).filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(date || ""); }))).sort();
        localStorage.setItem(localIndexKey(), JSON.stringify(next));
      } catch (e) {}
    }
    function rememberLocalSheet(sheet) {
      if (!sheet || !/^\d{4}-\d{2}-\d{2}$/.test(sheet.date || "")) return;
      var next = {
        date: sheet.date,
        lines: normalizeLines(sheet.lines),
        tolerance: FIXED_TOLERANCE,
        updatedAt: sheet.updatedAt || new Date().toISOString()
      };
      try { localStorage.setItem(sheetKey(sheet.date), JSON.stringify(next)); } catch (e) {}
      try {
        var index = new Set(readLocalIndex());
        if (sheetHasContent(next.lines)) index.add(sheet.date);
        else index.delete(sheet.date);
        writeLocalIndex(Array.from(index));
      } catch (e) {}
    }
    function buildLocalHistorySheets() {
      var dates = readLocalIndex();
      return dates.map(function (date) {
        var raw = null;
        try { raw = localStorage.getItem(sheetKey(date)) || localStorage.getItem(LS_LINES + ":" + date); } catch (e) {}
        var parsed = parseStoredSheet(raw) || {};
        return {
          date: date,
          lines: normalizeLines(parsed.lines),
          tolerance: FIXED_TOLERANCE,
          updatedAt: parsed.updatedAt || null
        };
      }).filter(function (sheet) { return sheetHasContent(sheet.lines); });
    }
    function setSync(text, state) { syncState.textContent = text; syncState.className = "sync-state " + (state || ""); }

    function save() {
      var sheet = currentSheetPayload(activeDate);
      try {
        localStorage.setItem(localLinesKey(sheet.date), JSON.stringify(sheet));
        localStorage.setItem(LS_DATE, sheet.date);
      } catch(e) {}
      rememberLocalSheet(sheet);
      refreshHistoryFromLocal();
      clearTimeout(syncTimer);
      syncTimer = setTimeout(function () { syncRemote(sheet); }, 500);
    }
    function loadLocal(date) {
      lines = [];
      try {
        var raw = localStorage.getItem(localLinesKey(date)) || localStorage.getItem(LS_LINES);
        var sheet = parseStoredSheet(raw);
        if (sheet && Array.isArray(sheet.lines)) lines = sheet.lines.map(cloneLine);
      } catch(e) {}
    }
    async function syncRemote(sheet) {
      sheet = sheet || currentSheetPayload(activeDate);
      if (!sheet.date) return false;
      setSync("Saving shared sheet...", "warn");
      try {
        var response = await fetch("/api/production", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: sheet.date, lines: sheet.lines, tolerance: sheet.tolerance })
        });
        if (!response.ok) throw new Error("offline");
        setSync("Autosaved " + sheet.date, "ok");
        return true;
      } catch (e) {
        setSync("Saved on this device · shared database unavailable", "warn");
        return false;
      }
    }
    async function loadRemote(date) {
      var requestedDate = date || activeDate || dateEl.value;
      if (!requestedDate) return;
      loadLocal(requestedDate); render();
      setSync("Loading shared sheet...");
      try {
        var response = await fetch("/api/production?date=" + encodeURIComponent(requestedDate));
        if (!response.ok) throw new Error("offline");
        var body = await response.json();
        var sheet = body.sheets && body.sheets[0];
        if (sheet && requestedDate === activeDate) {
          if (sheet.updatedAt || sheetHasContent(sheet.lines) || !sheetHasContent(lines)) {
            lines = normalizeLines(sheet.lines);
            rememberLocalSheet(sheet);
            render();
          } else {
            await syncRemote(currentSheetPayload(requestedDate));
          }
        }
        setSync("Loaded " + requestedDate, "ok");
      } catch (e) {
        setSync("Using this device · shared database unavailable", "warn");
      }
    }

    function tol() { return FIXED_TOLERANCE; }

    function computeLine(line) {
      var cyc = num(line.cycleTime), cav = num(line.cavity), hrs = num(line.hours),
          g = num(line.grammage), kg = num(line.kgPerBag), actualBags = num(line.actualBags);
      var target = (cyc != null && cyc > 0 && cav != null && hrs != null && g != null && kg != null && kg > 0)
        ? bagsFormula(cyc, cav, hrs, g, kg) : null;
      var targetKg = (target != null && kg != null) ? target * kg : null;
      var c = target != null ? classify(actualBags, target, tol()) : null;
      var targetPieces = (cyc != null && cyc > 0 && cav != null && hrs != null)
        ? piecesFormula(cyc, cav, hrs) : null;
      return {
        target: target,
        targetKg: targetKg,
        targetPieces: targetPieces,
        actual: actualBags,
        c: c
      };
    }

    function submitReasonAndReturnToCalculator(idx) {
      var line = lines[idx];
      if (!line || !line._fromCalc) return;
      line._fromCalc = false; // consume the "return" once reason is submitted
      save();

      // Hide the Done button elegantly
      var card = linesEl.querySelector('.line[data-i="' + idx + '"]');
      if (card) {
        var remarkWrap = card.querySelector(".l-remark");
        if (remarkWrap) {
          remarkWrap.classList.remove("show-done");
        }
      }

      // Clear the calculator fields and update machine name now
      if (window.__completeCalculatorRun) {
        window.__completeCalculatorRun(line.hours);
      }

      var machineEl = document.getElementById("machineName");
      var itemGrammageEl = document.getElementById("itemGrammage");
      var target = Number(line.hours) < 5 ? machineEl : itemGrammageEl;
      requestAnimationFrame(function () {
        setTimeout(function () {
          if (!target) return;
          target.focus();
          if (target.select) target.select();
        }, 75);
      });
    }

    function getActiveShiftFilter() {
      return activeShiftFilter;
    }

    function render() {
      linesEl.innerHTML = "";
      var activeShift = getActiveShiftFilter();
      
      var filtered = lines.map(function (line, idx) {
        return { line: line, originalIndex: idx };
      }).filter(function (item) {
        return activeShift === "all" || (item.line.shift || "A") === activeShift;
      });

      emptyState.style.display = filtered.length ? "none" : "block";

      filtered.forEach(function (item, idx) {
        var line = item.line;
        var originalIdx = item.originalIndex;
        var card = document.createElement("div");
        card.className = "line idle"; card.dataset.i = idx; card.dataset.originalI = originalIdx;

        // Top row
        var top = document.createElement("div"); top.className = "line-top";
        var n = document.createElement("span"); n.className = "line-n"; n.textContent = idx + 1;
        var machine = document.createElement("input");
        machine.type = "text"; machine.className = "l-machine";
        machine.placeholder = "Machine / line";
        machine.value = line.machine || "";
        machine.addEventListener("input", function () { line.machine = machine.value; save(); });
        machine.addEventListener("blur", function () {
          var norm = Analytics.normalizeMachineName(machine.value);
          machine.value = norm === "Unassigned machine" ? "" : norm;
          line.machine = machine.value;
          save();
          render();
        });

        var shiftSelect = document.createElement("select");
        shiftSelect.className = "l-line-shift";
        shiftSelect.innerHTML = '<option value="A">Shift A</option><option value="B">Shift B</option>';
        shiftSelect.value = line.shift || "A";
        shiftSelect.addEventListener("change", function () {
          line.shift = shiftSelect.value;
          save();
          render();
        });

        var itemInp = document.createElement("input");
        itemInp.type = "text"; itemInp.className = "l-item";
        itemInp.placeholder = "Item / type (e.g. 11.5gm 128mm)";
        itemInp.value = line.item || "";
        itemInp.addEventListener("input", function () { line.item = itemInp.value; save(); });
        var badge = document.createElement("span"); badge.className = "badge idle"; badge.textContent = "—";
        var del = document.createElement("button"); del.className = "l-del"; del.type = "button"; del.textContent = "✕"; del.title = "Remove";
        del.addEventListener("click", function () { lines.splice(originalIdx, 1); render(); save(); });
        top.appendChild(n); top.appendChild(machine); top.appendChild(shiftSelect); top.appendChild(itemInp); top.appendChild(badge); top.appendChild(del);

        // Params grid (5 fields + actualKg + actualBags = 7 cols)
        var grid = document.createElement("div"); grid.className = "l-grid";
        FIELDS.forEach(function (fd) {
          var lab = document.createElement("label"); lab.textContent = fd.label;
          var inp = document.createElement("input");
          inp.type = "number"; inp.step = "any"; inp.min = "0"; inp.inputMode = "decimal";
          inp.value = (line[fd.f] === "" || line[fd.f] == null) ? "" : line[fd.f];
          inp.addEventListener("input", function () { line[fd.f] = inp.value === "" ? "" : parseFloat(inp.value); updateAll(); save(); });
          lab.appendChild(inp); grid.appendChild(lab);
        });
        var aLab = document.createElement("label"); aLab.textContent = "Actual bags"; aLab.className = "a-lab";
        var aInp = document.createElement("input");
        aInp.type = "number"; aInp.step = "any"; aInp.min = "0"; aInp.inputMode = "decimal"; aInp.className = "is-actual";
        aInp.value = (line.actualBags === "" || line.actualBags == null) ? "" : line.actualBags;

        aInp.addEventListener("input", function () {
          line.actualBags = aInp.value === "" ? "" : parseFloat(aInp.value);
          updateAll(); save();
        });

        aLab.appendChild(aInp); grid.appendChild(aLab);

        var calc = document.createElement("div"); calc.className = "l-calc";

        var remarkWrap = document.createElement("div"); remarkWrap.className = "l-remark";
        var remark = document.createElement("input");
        remark.type = "text"; remark.placeholder = "Reason / explanation from factory worker";
        remark.value = line.remark || "";
        remark.addEventListener("input", function () {
          line.remark = remark.value;
          save();
          if (remark.value.trim() !== "") {
            remarkWrap.classList.add("show-done");
          } else {
            remarkWrap.classList.remove("show-done");
          }
        });
        remark.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); line.remark = remark.value; submitReasonAndReturnToCalculator(originalIdx); }
        });
        var doneBtn = document.createElement("button");
        doneBtn.type = "button";
        doneBtn.className = "mini-btn accent";
        doneBtn.textContent = "Done";
        doneBtn.title = "Submit reason and return to calculator";
        doneBtn.addEventListener("click", function () { line.remark = remark.value; submitReasonAndReturnToCalculator(originalIdx); });
        remarkWrap.appendChild(remark);
        remarkWrap.appendChild(doneBtn);

        card.appendChild(top); card.appendChild(grid); card.appendChild(calc); card.appendChild(remarkWrap);
        linesEl.appendChild(card);
      });

      updateAll();
    }

    function updateLineDOM(originalIdx, card, r) {
      var line = lines[originalIdx];
      var badge = card.querySelector(".badge");
      var calc  = card.querySelector(".l-calc");

      if (r.target == null) {
        card.className = "line idle"; badge.className = "badge idle"; badge.textContent = "—";
        calc.innerHTML = '<span class="seg">Fill all parameters to compute target.</span>';
        return;
      }

      var segs = [
        '<span class="seg">Target <b>' + fmt(r.target, 1) + "</b> bags &nbsp;·&nbsp; <b>" + fmt(r.targetKg, 1) + "</b> kg &nbsp;·&nbsp; <b>" + fmt(r.targetPieces, 0) + "</b> pcs</span>"
      ];
      if (r.c) {
        var sign = r.c.delta >= 0 ? "+" : "−";
        var actualKg = r.actual != null && line.kgPerBag != null ? r.actual * line.kgPerBag : 0;
        segs.push('<span class="seg ' + r.c.status + '">Actual <b>' + fmt(actualKg, 1) + " kg (" + fmt(r.actual, 0) + " bags)</b></span>");
        var varKg = r.c.delta * (line.kgPerBag || 0);
        segs.push('<span class="seg ' + r.c.status + '">Var <b>' + sign + fmt(Math.abs(varKg), 1) + " kg (" + sign + fmt(Math.abs(r.c.pct), 1) + "%)</b></span>");
        segs.push('<span class="seg ' + r.c.status + '">Eff <b>' + fmt(r.c.eff, 0) + "%</b></span>");
        card.className = "line " + r.c.status;
        badge.className = "badge " + r.c.status;
        badge.textContent = r.c.status === "ok" ? "On target"
          : r.c.status === "under" ? "Under " + fmt(Math.abs(r.c.pct), 0) + "%"
          : "Over " + fmt(Math.abs(r.c.pct), 0) + "%";
      } else {
        segs.push('<span class="seg">Enter actual bags or kg to check.</span>');
        card.className = "line idle"; badge.className = "badge idle"; badge.textContent = "—";
      }
      calc.innerHTML = segs.join("");
    }

    function updateAll() {
      var counts = { ok:0, under:0, over:0, checked:0 };
      var totTarget = 0, totTargetKg = 0, totTargetPieces = 0, totActual = 0, totActualKg = 0, haveActual = false;
      var activeShift = getActiveShiftFilter();
      
      lines.forEach(function (line, i) {
        if (activeShift !== "all" && (line.shift || "A") !== activeShift) {
          return;
        }
        
        var r = computeLine(line);
        var card = linesEl.querySelector('.line[data-original-i="' + i + '"]');
        if (card) {
          updateLineDOM(i, card, r);
        }
        
        if (r && r.target != null) {
          totTarget += r.target;
          if (r.targetKg != null) totTargetKg += r.targetKg;
          if (r.targetPieces != null) totTargetPieces += r.targetPieces;
          if (r.c) {
            counts[r.c.status]++;
            counts.checked++;
            totActual += r.actual || 0;
            totActualKg += (r.actual || 0) * (num(line.kgPerBag) || 0);
            haveActual = true;
          }
        }
      });

      var activeLines = lines.filter(function (l) { return activeShift === "all" || (l.shift || "A") === activeShift; });
      if (counts.checked === 0 && totTarget === 0) { summary.className = "summary-bar"; updatePrintSub(counts); return; }
      summary.className = "summary-bar show";
      var flagged = counts.under + counts.over;

      sumLine.innerHTML =
        '<span class="pill">Lines <span class="n">' + activeLines.length + '</span></span>' +
        '<span class="pill ok">On target <span class="n">' + counts.ok + '</span></span>' +
        '<span class="pill under">Under <span class="n">' + counts.under + '</span></span>' +
        '<span class="pill over">Over <span class="n">' + counts.over + '</span></span>';

      var eff = (haveActual && totTarget > 0) ? (totActual / totTarget * 100) : null;
      var effClass = (eff != null && eff >= 100 - tol()) ? "good" : "bad";
      sumTotals.innerHTML =
        "Target <b>" + fmt(totTarget, 0) + "</b> bags" +
        " · <b>" + fmt(totTargetKg, 1) + "</b> kg" +
        " · <b>" + fmt(totTargetPieces, 0) + "</b> pcs" +
        (haveActual ? " · Actual <b>" + fmt(totActualKg, 1) + "</b> kg · Efficiency <span class='eff-badge " + effClass + "'>" + (eff == null ? "—" : fmt(eff, 0) + "%") + "</span>" : "") +
        (flagged > 0
          ? " &nbsp;<span class='sum-note flag'>⚠ " + flagged + " line" + (flagged === 1 ? " needs" : "s need") + " follow-up</span>"
          : counts.checked > 0 ? " &nbsp;<span class='sum-note ok'>✓ All on target</span>" : "");

      updatePrintSub(counts);
    }

    function updatePrintSub(counts) {
      var d = dateEl.value ? new Date(dateEl.value + "T00:00").toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";
      var activeShift = getActiveShiftFilter();
      var activeLines = lines.filter(function (l) { return activeShift === "all" || (l.shift || "A") === activeShift; });
      var shiftText = activeShift === "all" ? "All Shifts" : "Shift " + activeShift;
      if (phSub) phSub.textContent = "Date: " + d + "  ·  Shift: " + shiftText + "  ·  Tolerance: ±1.5 bags  ·  Lines: " + activeLines.length + "  ·  Flagged: " + (counts.under + counts.over);
    }

    function weekStart(date) {
      return Analytics.weekStart(date);
    }

    function normalizeBackupSheets(input) {
      var sheets = [];
      if (Array.isArray(input)) sheets = input;
      else if (input && Array.isArray(input.sheets)) sheets = input.sheets;
      else if (input && input.date && Array.isArray(input.lines)) sheets = [input];
      return sheets.map(function (sheet) {
        return {
          date: sheet.date,
          lines: normalizeLines(sheet.lines),
          tolerance: FIXED_TOLERANCE,
          updatedAt: sheet.updatedAt || null
        };
      }).filter(function (sheet) {
        return /^\d{4}-\d{2}-\d{2}$/.test(sheet.date || "") && sheetHasContent(sheet.lines);
      });
    }

    function downloadJson(filename, payload) {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function csvCell(value) {
      if (value == null) return "";
      var text = String(value);
      if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
      return text;
    }

    function downloadCsv(filename, headers, rows) {
      var csv = [headers].concat(rows).map(function (row) {
        return row.map(csvCell).join(",");
      }).join("\r\n");
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    async function exportBackup() {
      setSync("Preparing backup...", "warn");
      var remoteSheets = await fetchRemoteHistory();
      var localSheets = buildLocalHistorySheets();
      var sheets = mergeHistorySheets(remoteSheets || [], localSheets);
      var current = currentSheetPayload();
      if (sheetHasContent(current.lines) && !sheets.some(function (sheet) { return sheet.date === current.date; })) {
        sheets.unshift(current);
      }
      var backup = {
        app: "nkpl-production",
        version: 3,
        exportedAt: new Date().toISOString(),
        currentDate: dateEl.value,
        tolerance: tol(),
        sheets: sheets,
        analytics: sheets.map(function (sheet) {
          return Analytics.summarizeSheet(sheet);
        })
      };
      downloadJson("nkpl-production-backup-" + (dateEl.value || "backup") + ".json", backup);
      setSync("Backup exported", "ok");
    }

    function openImportPicker() {
      var input = document.getElementById("backupFileInput");
      if (!input) return;
      input.value = "";
      input.click();
    }

    async function importBackupFromFile(file) {
      if (!file) return;
      setSync("Importing backup...", "warn");
      var text = await file.text();
      var parsed = JSON.parse(text);
      var sheets = normalizeBackupSheets(parsed);
      if (!sheets.length) throw new Error("No saved days found in that file");
      sheets.forEach(function (sheet) { rememberLocalSheet(sheet); });
      var latest = sheets.reduce(function (best, sheet) {
        return !best || sheet.date > best.date ? sheet : best;
      }, null);
      if (latest) {
        activeDate = latest.date;
        dateEl.value = latest.date;
        localStorage.setItem(LS_DATE, latest.date);
        lines = normalizeLines(latest.lines);
        selectedDailyDate = latest.date;
        selectedWeekStart = weekStart(latest.date);
        setView("editor");
        render();
      }
      try {
        var response = await fetch("/api/production", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheets: sheets })
        });
        if (!response.ok) throw new Error("offline");
        setSync("Backup imported and synced", "ok");
      } catch (e) {
        setSync("Backup imported on this device · database unavailable", "warn");
      }
      await refreshHistory();
      await loadRemote(activeDate).catch(function () {});
    }

    function mergeHistorySheets(remoteSheets, localSheets) {
      var map = new Map();
      (Array.isArray(remoteSheets) ? remoteSheets : []).forEach(function (sheet) {
        if (sheet && sheet.date && sheetHasContent(sheet.lines)) map.set(sheet.date, sheet);
      });
      (Array.isArray(localSheets) ? localSheets : []).forEach(function (sheet) {
        if (sheet && sheet.date && sheetHasContent(sheet.lines)) map.set(sheet.date, sheet);
      });
      return Array.from(map.values()).sort(function (a, b) { return b.date.localeCompare(a.date); });
    }

    async function fetchRemoteHistory() {
      try {
        var response = await fetch("/api/production?all=1");
        if (!response.ok) throw new Error("offline");
        var body = await response.json();
        if (Array.isArray(body.sheets) && body.sheets.length) return body.sheets;
      } catch (e) {
        // fall through to the recent-range backup path below
      }
      try {
        var anchor = dateEl.value || yesterdayISO();
        var start = new Date(anchor + "T00:00:00");
        start.setDate(start.getDate() - 30);
        var from = Analytics.localDateISO(start);
        var response2 = await fetch("/api/production?start=" + from + "&days=31");
        if (!response2.ok) throw new Error("offline");
        var body2 = await response2.json();
        return Array.isArray(body2.sheets) ? body2.sheets : [];
      } catch (e2) {
        return null;
      }
    }

    async function refreshHistory() {
      if (!dateEl.value) return;
      var remoteSheets = await fetchRemoteHistory();
      var localSheets = buildLocalHistorySheets();
      renderHistory(remoteSheets ? mergeHistorySheets(remoteSheets, localSheets) : localSheets);
    }

    function sheetForDate(date) {
      if (date === activeDate) return currentSheetPayload(activeDate);
      return historySheets.find(function (sheet) { return sheet.date === date; }) || { date: date, lines: [], tolerance: tol() };
    }

    function sheetsWithCurrent() {
      var sheets = historySheets.filter(function (sheet) { return sheet.date !== activeDate; });
      var current = currentSheetPayload(activeDate);
      if (sheetHasContent(current.lines)) sheets.push(current);
      return sheets;
    }

    function renderDailyReport() {
      var report = document.getElementById("dailyReport");
      if (!report) return;
      selectedDailyDate = selectedDailyDate || activeDate || dateEl.value;
      report.innerHTML = Analytics.reportHtml(Analytics.summarizeSheet(sheetForDate(selectedDailyDate), selectedDailyShift), { scope: "day" });
    }

    window.weeklyCharts = [];

    function destroyWeeklyCharts() {
      if (window.weeklyCharts && window.weeklyCharts.length) {
        window.weeklyCharts.forEach(function (chart) {
          try { chart.destroy(); } catch (e) {}
        });
      }
      window.weeklyCharts = [];
    }

    function initWeeklyCharts(summary) {
      if (typeof Chart === "undefined") {
        setSync("Weekly report ready · charts still loading", "warn");
        return;
      }
      Chart.defaults.responsive = true;
      Chart.defaults.maintainAspectRatio = false;
      Chart.defaults.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      var palette = [
        '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#14b8a6', '#f43f5e', '#64748b',
        '#84cc16', '#0ea5e9', '#d946ef', '#f97316', '#22c55e',
        '#e11d48', '#7c3aed', '#0891b2', '#65a30d', '#ca8a04'
      ];

      // 1. Line Chart (Daily production trend)
      var ctxLine = document.getElementById("weeklyDailyTrendChart");
      if (ctxLine && summary.days && summary.days.length) {
        var labels = summary.days.map(function (d) { return Analytics.formatDate(d.date); });
        var data = summary.days.map(function (d) { return d.actualKg || 0; });
        var lineChart = new Chart(ctxLine, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Production (kg)',
              data: data,
              borderColor: '#4f46e5',
              backgroundColor: 'rgba(79, 70, 229, 0.06)',
              borderWidth: 2.5,
              fill: true,
              tension: 0.35,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: '#4f46e5',
              pointBorderColor: '#fff',
              pointBorderWidth: 1.5
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                padding: 10,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleFont: { size: 11, weight: 'bold' },
                bodyFont: { size: 11 },
                callbacks: {
                  label: function(context) {
                    return ' Production: ' + context.parsed.y.toLocaleString() + ' kg';
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(226, 232, 240, 0.8)', borderDash: [4, 4] },
                ticks: { font: { size: 10 }, color: '#64748b' }
              },
              x: {
                grid: { display: false },
                ticks: { font: { size: 10 }, color: '#64748b' }
              }
            }
          }
        });
        window.weeklyCharts.push(lineChart);
      }

      // 2. Pie Chart (Product Mix)
      var ctxPie = document.getElementById("weeklyProductMixChart");
      if (ctxPie && summary.items && summary.items.length) {
        var pieItems = summary.items;
        var labels = pieItems.map(function (it) { return it.label; });
        var data = pieItems.map(function (it) { return it.actualKg || 0; });
        var pieChart = new Chart(ctxPie, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Product output (kg)',
              data: data,
              backgroundColor: labels.map(function (_, index) { return palette[index % palette.length]; }),
              borderRadius: 5,
              borderWidth: 0
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                padding: 10,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                callbacks: {
                  label: function(context) {
                    var val = context.parsed.x;
                    var total = context.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                    var pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                    return ' ' + context.label + ': ' + val.toLocaleString() + ' kg (' + pct + '%)';
                  }
                }
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                grid: { color: 'rgba(226, 232, 240, 0.8)', borderDash: [4, 4] },
                ticks: { font: { size: 10 }, color: '#64748b' }
              },
              y: {
                grid: { display: false },
                ticks: { font: { size: 9 }, color: '#475569', autoSkip: false }
              }
            }
          }
        });
        window.weeklyCharts.push(pieChart);
      }

      // 3. Bar Chart (Machine Performance)
      var ctxBar = document.getElementById("weeklyMachinePerformanceChart");
      if (ctxBar && summary.machines && summary.machines.length) {
        var labels = summary.machines.map(function (m) { return m.label; });
        var data = summary.machines.map(function (m) { return m.actualKg || 0; });
        var barChart = new Chart(ctxBar, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Production (kg)',
              data: data,
              backgroundColor: 'rgba(99, 102, 241, 0.85)',
              hoverBackgroundColor: '#4f46e5',
              borderRadius: 6,
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                padding: 10,
                backgroundColor: 'rgba(15, 23, 42, 0.9)'
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(226, 232, 240, 0.8)', borderDash: [4, 4] },
                ticks: { font: { size: 10 }, color: '#64748b' }
              },
              x: {
                grid: { display: false },
                ticks: { font: { size: 10 }, color: '#64748b' }
              }
            }
          }
        });
        window.weeklyCharts.push(barChart);
      }

      // 4. Runtime chart (machine running hours)
      var ctxRuntime = document.getElementById("weeklyMachineRuntimeChart");
      if (ctxRuntime && summary.machines && summary.machines.length) {
        var runtimeLabels = summary.machines.map(function (m) { return m.label; });
        var runtimeData = summary.machines.map(function (m) { return m.runHours || 0; });
        var runtimeChart = new Chart(ctxRuntime, {
          type: 'bar',
          data: {
            labels: runtimeLabels,
            datasets: [{
              label: 'Runtime (hours)',
              data: runtimeData,
              backgroundColor: 'rgba(20, 184, 166, 0.82)',
              hoverBackgroundColor: '#0f766e',
              borderRadius: 6,
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                padding: 10,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                callbacks: {
                  label: function(context) {
                    return ' Runtime: ' + context.parsed.y.toLocaleString() + ' hr';
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(226, 232, 240, 0.8)', borderDash: [4, 4] },
                ticks: { font: { size: 10 }, color: '#64748b' }
              },
              x: {
                grid: { display: false },
                ticks: { font: { size: 10 }, color: '#64748b' }
              }
            }
          }
        });
        window.weeklyCharts.push(runtimeChart);
      }

      // 5. Machine target-attainment chart
      var ctxEfficiency = document.getElementById("weeklyMachineEfficiencyChart");
      if (ctxEfficiency && summary.machines && summary.machines.length) {
        var efficiencyLabels = summary.machines.map(function (m) { return m.label; });
        var efficiencyData = summary.machines.map(function (m) { return m.efficiency || 0; });
        var efficiencyChart = new Chart(ctxEfficiency, {
          type: 'bar',
          data: {
            labels: efficiencyLabels,
            datasets: [{
              label: 'Target attainment (%)',
              data: efficiencyData,
              backgroundColor: efficiencyData.map(function (value) {
                return value >= 95 ? 'rgba(16, 185, 129, 0.85)' : value >= 85 ? 'rgba(245, 158, 11, 0.85)' : 'rgba(239, 68, 68, 0.85)';
              }),
              borderRadius: 6,
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                padding: 10,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                callbacks: {
                  label: function(context) {
                    return ' Attainment: ' + context.parsed.y.toFixed(1) + '%';
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                suggestedMax: Math.max(110, Math.ceil(Math.max.apply(null, efficiencyData) / 10) * 10),
                grid: { color: 'rgba(226, 232, 240, 0.8)', borderDash: [4, 4] },
                ticks: {
                  font: { size: 10 },
                  color: '#64748b',
                  callback: function(value) { return value + '%'; }
                }
              },
              x: {
                grid: { display: false },
                ticks: { font: { size: 10 }, color: '#64748b' }
              }
            }
          }
        });
        window.weeklyCharts.push(efficiencyChart);
      }

      // 6. Stacked machine/product output chart
      var ctxMachineProduct = document.getElementById("weeklyMachineProductChart");
      if (ctxMachineProduct && summary.machineProducts && summary.machineProducts.length) {
        var machineLabels = summary.machines.map(function (m) { return m.label; });
        var itemTotals = {};
        summary.machineProducts.forEach(function (row) {
          itemTotals[row.item] = (itemTotals[row.item] || 0) + (row.actualKg || 0);
        });
        var productLabels = Object.keys(itemTotals).sort(function (a, b) { return itemTotals[b] - itemTotals[a]; });
        var datasets = productLabels.map(function (item, index) {
          return {
            label: item,
            data: machineLabels.map(function (machine) {
              return summary.machineProducts
                .filter(function (row) { return row.machine === machine && row.item === item; })
                .reduce(function (sum, row) { return sum + (row.actualKg || 0); }, 0);
            }),
            backgroundColor: palette[index % palette.length],
            borderWidth: 0,
            borderRadius: 4
          };
        });
        var machineProductChart = new Chart(ctxMachineProduct, {
          type: 'bar',
          data: {
            labels: machineLabels,
            datasets: datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  boxWidth: 10,
                  font: { size: 9, weight: '600' },
                  color: '#475569',
                  padding: 10
                }
              },
              tooltip: {
                padding: 10,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                callbacks: {
                  label: function(context) {
                    return ' ' + context.dataset.label + ': ' + context.parsed.y.toLocaleString() + ' kg';
                  }
                }
              }
            },
            scales: {
              x: {
                stacked: true,
                grid: { display: false },
                ticks: { font: { size: 10 }, color: '#64748b' }
              },
              y: {
                stacked: true,
                beginAtZero: true,
                grid: { color: 'rgba(226, 232, 240, 0.8)', borderDash: [4, 4] },
                ticks: { font: { size: 10 }, color: '#64748b' }
              }
            }
          }
        });
        window.weeklyCharts.push(machineProductChart);
      }
    }

    function renderWeeklyReport() {
      var report = document.getElementById("weeklyReport");
      if (!report) return;
      selectedWeekStart = selectedWeekStart || weekStart(activeDate || dateEl.value);
      var summary = Analytics.summarizeWeek(sheetsWithCurrent(), selectedWeekStart, selectedWeeklyShift);
      destroyWeeklyCharts();
      report.innerHTML = Analytics.reportHtml(summary, { scope: "week" });
      if (summary && summary.entries) {
        initWeeklyCharts(summary);
      }
    }

    function selectedWeekSheets() {
      var start = selectedWeekStart || weekStart(activeDate || dateEl.value);
      return sheetsWithCurrent().filter(function (sheet) {
        return sheet && sheet.date && weekStart(sheet.date) === start && sheetHasContent(sheet.lines);
      }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    }

    function exportWeeklyCsv() {
      selectedWeekStart = selectedWeekStart || weekStart(activeDate || dateEl.value);
      var headers = [
        "Week start", "Week end", "Date", "Shift", "Machine", "Item",
        "Cycle time", "Cavity", "Hours", "Grammage", "Kg per bag",
        "Target bags", "Target kg", "Target pieces",
        "Actual bags", "Actual kg", "Actual pieces",
        "Variance bags", "Variance kg", "Efficiency %", "Status", "Remark"
      ];
      var summary = Analytics.summarizeWeek(sheetsWithCurrent(), selectedWeekStart, selectedWeeklyShift);
      var rows = [];
      selectedWeekSheets().forEach(function (sheet) {
        sheet.lines.forEach(function (line) {
          var shift = line.shift || "A";
          if (!lineHasContent(line) || (selectedWeeklyShift !== "total" && shift !== selectedWeeklyShift)) return;
          var entry = Analytics.computeLine(Object.assign({}, line, { date: sheet.date }), tol());
          rows.push([
            selectedWeekStart, summary.end, sheet.date, shift, entry.machine, entry.item,
            entry.cycleTime, entry.cavity, entry.hours, entry.grammage, entry.kgPerBag,
            entry.targetBags == null ? "" : entry.targetBags.toFixed(2),
            entry.targetKg == null ? "" : entry.targetKg.toFixed(2),
            entry.targetPieces == null ? "" : Math.round(entry.targetPieces),
            entry.actualBags == null ? "" : entry.actualBags,
            entry.actualKg == null ? "" : entry.actualKg.toFixed(2),
            entry.actualPieces == null ? "" : Math.round(entry.actualPieces),
            entry.varianceBags == null ? "" : entry.varianceBags.toFixed(2),
            entry.varianceKg == null ? "" : entry.varianceKg.toFixed(2),
            entry.efficiency == null ? "" : entry.efficiency.toFixed(1),
            Analytics.statusWord(entry.status),
            entry.remark
          ]);
        });
      });
      if (!rows.length) {
        setSync("No weekly rows to export", "warn");
        return;
      }
      var suffix = selectedWeeklyShift === "total" ? "all-shifts" : "shift-" + selectedWeeklyShift;
      downloadCsv("nkpl-weekly-production-" + selectedWeekStart + "-" + suffix + ".csv", headers, rows);
      setSync("Weekly CSV exported", "ok");
    }

    function refreshHistoryFromLocal() {
      renderHistory(mergeHistorySheets(historySheets, buildLocalHistorySheets()));
    }

    function renderHistory(sheets) {
      var daily = document.getElementById("dailyHistory");
      var weekly = document.getElementById("weeklyHistory");
      if (!daily || !weekly) return;
      daily.innerHTML = "";
      weekly.innerHTML = "";
      historySheets = (sheets || []).filter(function (sheet) {
        return sheet && sheet.date && Array.isArray(sheet.lines) && sheetHasContent(sheet.lines);
      }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      if (!selectedDailyDate || !historySheets.some(function (sheet) { return sheet.date === selectedDailyDate; })) {
        selectedDailyDate = activeDate || (historySheets[0] && historySheets[0].date) || "";
      }
      if (!selectedWeekStart) selectedWeekStart = weekStart(activeDate || dateEl.value);

      var filteredDailySheets = historySheets.filter(function (sheet) {
        return sheet.lines.some(function (line) {
          return lineHasContent(line) && (selectedDailyShift === "total" || (line.shift || "A") === selectedDailyShift);
        });
      });

      filteredDailySheets.forEach(function (sheet) {
        var summary = Analytics.summarizeSheet(sheet, selectedDailyShift);
        var card = document.createElement("div");
        card.className = "history-card" + (sheet.date === selectedDailyDate ? " active" : "");
        card.innerHTML = '<h3><span>' + Analytics.formatDate(sheet.date) + '</span><span>' + fmt(summary.actualKg, 1) + ' kg</span></h3>' +
          '<div class="meta">Lines: ' + summary.entries + ' · Run time: ' + fmt(summary.runHours, 1) + ' hr · Actual: ' + fmt(summary.actualBags, 0) + ' bags · Efficiency: ' + (summary.efficiency == null ? "-" : fmt(summary.efficiency, 1) + "%") + '</div>' +
          '<div class="history-actions"><button class="mini-btn" data-report type="button">View report</button><button class="mini-btn" data-open type="button">Open log</button></div>';
        card.querySelector("[data-report]").addEventListener("click", function () {
          selectedDailyDate = sheet.date;
          renderHistory(historySheets);
          setView("daily");
        });
        card.querySelector("[data-open]").addEventListener("click", function () {
          changeLoggingDate(sheet.date);
        });
        daily.appendChild(card);
      });

      var filteredWeeklySheets = historySheets.filter(function (sheet) {
        return sheet.lines.some(function (line) {
          return lineHasContent(line) && (selectedWeeklyShift === "total" || (line.shift || "A") === selectedWeeklyShift);
        });
      });

      var weeks = Array.from(new Set(filteredWeeklySheets.map(function (sheet) { return weekStart(sheet.date); }))).sort(function (a, b) { return b.localeCompare(a); });
      if (!weeks.includes(selectedWeekStart)) selectedWeekStart = weekStart(activeDate || dateEl.value);
      weeks.forEach(function (wk) {
        var summary = Analytics.summarizeWeek(filteredWeeklySheets, wk, selectedWeeklyShift);
        if (!summary.entries) return;
        var card = document.createElement("div");
        card.className = "history-card" + (wk === selectedWeekStart ? " active" : "");
        card.innerHTML = '<h3><span>Week of ' + Analytics.formatDate(wk) + '</span><span>' + fmt(summary.actualKg, 1) + ' kg</span></h3>' +
          '<div class="meta">Days: ' + summary.dayCount + ' · Lines: ' + summary.entries + ' · Run time: ' + fmt(summary.runHours, 1) + ' hr · Actual: ' + fmt(summary.actualBags, 0) + ' bags · Efficiency: ' + (summary.efficiency == null ? "-" : fmt(summary.efficiency, 1) + "%") + '</div>' +
          '<div class="history-actions"><button class="mini-btn" data-report type="button">View week report</button></div>';
        card.querySelector("[data-report]").addEventListener("click", function () {
          selectedWeekStart = wk;
          renderHistory(historySheets);
          setView("weekly");
        });
        weekly.appendChild(card);
      });
      if (!daily.children.length) daily.innerHTML = '<div class="history-card"><h3>No production days yet</h3><div class="meta">Dated logs appear automatically after production entries are added.</div></div>';
      if (!weekly.children.length) weekly.innerHTML = '<div class="history-card"><h3>No weekly analytics yet</h3><div class="meta">Weekly totals appear automatically as dated entries are logged.</div></div>';
      renderDailyReport();
      renderWeeklyReport();
    }

    function readyChartsForPrint(scope) {
      if (scope !== "weekly" || !window.weeklyCharts || !window.weeklyCharts.length) {
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            window.weeklyCharts.forEach(function (chart) {
              try {
                chart.resize();
                chart.update("none");
              } catch (e) {}
            });
            setTimeout(resolve, 350);
          });
        });
      });
    }

    function printReport(scope) {
      var className = scope === "weekly" ? "print-weekly" : "print-daily";
      var previousTitle = document.title;
      var titlePrefix = scope === "weekly" ? "NKPL Weekly Production Report" : "NKPL Daily Production Report";
      setView(scope === "weekly" ? "weekly" : "daily");
      document.title = titlePrefix + " - " + (scope === "weekly" ? selectedWeekStart : selectedDailyDate || activeDate || "");
      document.body.classList.remove("print-daily", "print-weekly");
      document.body.classList.add(className);
      var cleanup = function () {
        document.body.classList.remove("print-daily", "print-weekly");
        document.title = previousTitle;
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      readyChartsForPrint(scope).then(function () {
        setTimeout(function () { window.print(); }, 100);
      });
    }

    function setView(view) {
      ["editor", "daily", "weekly"].forEach(function (name) {
        var panel = document.getElementById(name + "View");
        var btn = document.querySelector('.tab-btn[data-view="' + name + '"]');
        if (panel) panel.classList.toggle("active", name === view);
        if (btn) btn.classList.toggle("active", name === view);
      });
      if (view === "daily") renderDailyReport();
      if (view === "weekly") renderWeeklyReport();
    }

    function yesterdayISO() {
      var d = new Date();
      d.setDate(d.getDate() - 1);
      return Analytics.localDateISO(d);
    }

    async function changeLoggingDate(nextDate) {
      if (!nextDate) return;
      if (nextDate === activeDate) {
        dateEl.value = nextDate;
        setView("editor");
        return;
      }
      clearTimeout(syncTimer);
      if (activeDate) await syncRemote(currentSheetPayload(activeDate));
      activeDate = nextDate;
      dateEl.value = nextDate;
      selectedDailyDate = nextDate;
      selectedWeekStart = weekStart(nextDate);
      try { localStorage.setItem(LS_DATE, nextDate); } catch (e) {}
      await loadRemote(nextDate);
      await refreshHistory();
      setView("editor");
    }

    /* Bridge: add pre-filled line from calculator */
    window.__addToLog = function (params) {
      var defaultShift = (activeShiftFilter === "all" || !activeShiftFilter) ? "A" : activeShiftFilter;
      lines.push(Object.assign(emptyLine(), {
        machine: params.machine, shift: defaultShift, item: params.item,
        cycleTime: params.cycleTime, cavity: params.cavity, hours: params.hours,
        grammage: params.grammage, kgPerBag: params.kgPerBag, 
        actualBags: params.actualBags,
        _fromCalc: true
      }));
      render(); save();

      var idx = lines.length - 1;
      var card = linesEl.querySelector('.line[data-original-i="' + idx + '"]');
      if (card) {
        card.scrollIntoView({ behavior:"smooth", block:"nearest" });
        card.classList.add("flash");
        setTimeout(function(){ card.classList.remove("flash"); }, 900);
        setTimeout(function(){
          var ri = card.querySelector(".l-remark input");
          if (ri) { ri.focus(); ri.placeholder = "Enter reason / explanation from factory worker"; }
        }, 250);
      }
    };

    document.getElementById("clearLinesBtn").addEventListener("click", function(){
      if (lines.length && !confirm("Clear all logged lines? This cannot be undone.")) return;
      lines = []; render(); save();
    });
    document.getElementById("dailyPrintBtn").addEventListener("click", function () { printReport("daily"); });
    document.getElementById("weeklyPrintBtn").addEventListener("click", function () { printReport("weekly"); });
    document.getElementById("weeklyCsvBtn").addEventListener("click", exportWeeklyCsv);
    document.getElementById("exportBackupBtn").addEventListener("click", exportBackup);
    document.getElementById("importBackupBtn").addEventListener("click", openImportPicker);
    document.getElementById("backupFileInput").addEventListener("change", function () {
      var file = this.files && this.files[0];
      if (!file) return;
      importBackupFromFile(file).catch(function (err) {
        setSync(err && err.message ? err.message : "Import failed", "warn");
      });
    });
    document.getElementById("dailyRefreshBtn").addEventListener("click", refreshHistory);
    document.getElementById("weeklyRefreshBtn").addEventListener("click", refreshHistory);
    document.getElementById("dailyOpenBtn").addEventListener("click", function(){ changeLoggingDate(selectedDailyDate || activeDate); });
    document.getElementById("weeklyOpenBtn").addEventListener("click", function(){ selectedWeekStart = weekStart(activeDate); renderWeeklyReport(); });
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { setView(btn.dataset.view); });
    });
    dateEl.addEventListener("input", function(){ changeLoggingDate(dateEl.value); });

    // Topbar Shift Toggle Group
    var editorShiftGroup = document.getElementById("editorShiftGroup");
    if (editorShiftGroup) {
      editorShiftGroup.querySelectorAll(".shift-toggle-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          editorShiftGroup.querySelectorAll(".shift-toggle-btn").forEach(function (b) {
            b.classList.remove("active");
          });
          btn.classList.add("active");
          activeShiftFilter = btn.dataset.shift;
          render();
        });
      });
    }

    // Daily shift filter buttons
    var dailyShiftFilterGroup = document.getElementById("dailyShiftFilterGroup");
    if (dailyShiftFilterGroup) {
      dailyShiftFilterGroup.querySelectorAll("button").forEach(function (btn) {
        btn.addEventListener("click", function () {
          dailyShiftFilterGroup.querySelectorAll("button").forEach(function (b) {
            b.classList.remove("active");
          });
          btn.classList.add("active");
          selectedDailyShift = btn.dataset.shift;
          renderDailyReport();
          refreshHistory();
        });
      });
    }

    // Weekly shift filter buttons
    var weeklyShiftFilterGroup = document.getElementById("weeklyShiftFilterGroup");
    if (weeklyShiftFilterGroup) {
      weeklyShiftFilterGroup.querySelectorAll("button").forEach(function (btn) {
        btn.addEventListener("click", function () {
          weeklyShiftFilterGroup.querySelectorAll("button").forEach(function (b) {
            b.classList.remove("active");
          });
          btn.classList.add("active");
          selectedWeeklyShift = btn.dataset.shift;
          renderWeeklyReport();
          refreshHistory();
        });
      });
    }

    dateEl.value = yesterdayISO();
    activeDate = dateEl.value;
    selectedDailyDate = activeDate;
    selectedWeekStart = weekStart(activeDate);
    loadLocal(activeDate);
    render();
    loadRemote(activeDate);
    refreshHistory();
  })();
