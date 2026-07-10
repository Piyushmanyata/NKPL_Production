const fs = require('fs');
const path = require('path');

const file1 = path.join(__dirname, '..', 'data', 'postgres-backup-2026-07-03-0504.json');
const data = JSON.parse(fs.readFileSync(file1, 'utf8'));

const items = new Set();
data.sheets.forEach(sheet => {
  if (sheet.lines) {
    sheet.lines.forEach(line => {
      if (line.item) {
        items.add(line.item);
      }
    });
  }
});

const sorted = Array.from(items).sort();
sorted.forEach(item => console.log(item));
