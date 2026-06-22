const fs = require('fs');
const path = 'c:\\Users\\piyus\\Downloads\\nkpl-production-backup-2026-06-18.json';

try {
  const content = fs.readFileSync(path, 'utf8');
  const data = JSON.parse(content);
  console.log("exportedAt:", data.exportedAt);
  console.log("currentDate:", data.currentDate);
} catch (e) {
  console.error("Error:", e);
}
