const fs = require('fs');
const path = require('path');

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

const testCases = [
  "10.5gm pco csd natural",
  "10.5gm 28mm CSD",
  "10.5gm 28mm csd natural",
  "10.5gm 28mm csd green"
];

testCases.forEach(tc => {
  console.log(`${tc.padEnd(35)} -> ${normalizeItemName(tc)}`);
});
