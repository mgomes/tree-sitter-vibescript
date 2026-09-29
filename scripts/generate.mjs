import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import letters from "@unicode/unicode-17.0.0/General_Category/Letter/code-points.mjs";
import digits from "@unicode/unicode-17.0.0/General_Category/Decimal_Number/code-points.mjs";
import uppercase from "@unicode/unicode-17.0.0/General_Category/Uppercase_Letter/code-points.mjs";

function characterClass(points) {
  const sorted = [...new Set(points)].sort((a, b) => a - b);
  const escape = (point) => `\\u{${point.toString(16)}}`;
  const ranges = [];
  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i];
    let last = first;
    while (sorted[i + 1] === last + 1) last = sorted[++i];
    ranges.push(first === last ? escape(first) : `${escape(first)}-${escape(last)}`);
  }
  return `[${ranges.join("")}]`;
}

const upper = new Set(uppercase);
const continuation = characterClass([...letters, ...digits, 95]);
const names = {
  identifier: characterClass([...letters.filter((c) => !upper.has(c)), 95]) + continuation + "*",
  constant: characterClass(uppercase) + continuation + "*",
  symbol: characterClass([...letters, ...digits, 95]) + continuation + "*",
  variable: continuation + "+",
};
writeFileSync(new URL("../unicode.js", import.meta.url),
  "// Generated from Unicode 17.0.0 by scripts/generate.mjs.\n" +
  "module.exports = " + JSON.stringify(names, null, 2) + ";\n");

execFileSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/tree-sitter-cli/cli.js", import.meta.url)),
  "generate",
], { cwd: new URL("..", import.meta.url), stdio: "inherit" });
for (const name of ["grammar.json", "node-types.json"]) {
  const path = new URL(`../src/${name}`, import.meta.url);
  writeFileSync(path, readFileSync(path, "utf8").trimEnd() + "\n");
}
