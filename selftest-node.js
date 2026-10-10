// Runs the ?selftest=1 checks under Node: node selftest-node.js
// Loads the pure scripts (everything index.html loads except js/app/, *-ui.js and
// the self-test page), in index.html's order, and prints PASS / FAIL per check.
// Exit code 0 when everything passes.
const fs = require("fs");
const path = require("path");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const pure = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
  .filter(src => !src.startsWith("js/app/") && !src.endsWith("-ui.js") && src !== "js/selftest-page.js");
const code = pure.map(src => fs.readFileSync(path.join(root, src), "utf8")).join("\n;\n");
const { OffensePlanner, TrainingLog } = new Function(code + "\nreturn { OffensePlanner, TrainingLog };")();

const quiet = process.argv.includes("-q");
const result = OffensePlanner.runSelfTest(line => {
  if (!quiet || !line.startsWith("PASS")) console.log(line);
}, 10000, [TrainingLog.selfTest]);
process.exit(result.passed ? 0 : 1);
