# Graph Report - .  (2026-07-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 231 nodes · 467 edges · 17 communities (16 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `33214c59`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16

## God Nodes (most connected - your core abstractions)
1. `reportHtml()` - 15 edges
2. `calculate()` - 13 edges
3. `summarizeLines()` - 12 edges
4. `sheetHasContent()` - 12 edges
5. `renderHistory()` - 12 edges
6. `fmt()` - 11 edges
7. `loadRemote()` - 11 edges
8. `esc()` - 10 edges
9. `currentSheetPayload()` - 10 edges
10. `importBackupFromFile()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `getAllSheets()` --calls--> `getSql()`  [EXTRACTED]
  api/lib/production-db.js → api/lib/neon.js
- `getSheetsByDateRange()` --calls--> `getSql()`  [EXTRACTED]
  api/lib/production-db.js → api/lib/neon.js
- `saveSheet()` --calls--> `getSql()`  [EXTRACTED]
  api/lib/production-db.js → api/lib/neon.js

## Import Cycles
- None detected.

## Communities (17 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (39): bagsFormula(), calculate(), classify(), clearAutoLogTimer(), clearOutputs(), cloneLine(), completeRun(), computeLine() (+31 more)

### Community 1 - "Community 1"
Cohesion: 0.16
Nodes (37): add(), blankSummary(), computeLine(), computeMouldAnalysis(), dayRows(), distinctItemsForMachine(), esc(), finish() (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.15
Nodes (35): buildLocalHistorySheets(), changeLoggingDate(), csvCell(), currentSheetPayload(), destroyCharts(), downloadCsv(), downloadJson(), exportBackup() (+27 more)

### Community 3 - "Community 3"
Cohesion: 0.19
Nodes (14): getSql(), { neon }, ping(), buildDateRange(), bulkSaveSheets(), getAllSheets(), getSheetsByDateRange(), { getSql } (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (13): backup, backupSheets, dataDir, __dirname, filepath, fileSizeKb, linesBySheet, now (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (10): allDates, __dirname, displayUrl, jsonAllSheets, jsonContentSheets, jsonDateMap, jsonTotalLines, pgDateMap (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (11): dependencies, @neondatabase/serverless, description, name, private, scripts, db:backup, db:restore (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (5): __dirname, displayUrl, errors, ROOT, sql

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (5): __dirname, displayUrl, ROOT, schemaSql, sql

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): data, file1, fs, items, path, sorted

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): allProjects, args, __dirname, headers, ROOT, setIdx

### Community 11 - "Community 11"
Cohesion: 0.40
Nodes (3): fs, path, testCases

### Community 12 - "Community 12"
Cohesion: 0.50
Nodes (3): edgeProcess, { exec }, http

### Community 13 - "Community 13"
Cohesion: 0.50
Nodes (3): edgeProcess, { exec }, http

### Community 14 - "Community 14"
Cohesion: 0.50
Nodes (3): __dirname, ROOT, sql

### Community 15 - "Community 15"
Cohesion: 0.50
Nodes (3): maxDuration, functions, api/production.js

## Knowledge Gaps
- **70 isolated node(s):** `{ neon }`, `{ getSql }`, `name`, `version`, `private` (+65 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `{ neon }`, `{ getSql }`, `name` to the rest of the system?**
  _70 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.10741971207087486 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.146218487394958 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._