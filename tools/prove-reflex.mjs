// Run current Reflex tests against the packed SDK in an isolated snapshot.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.argv[2];
const ref = process.argv[3] ?? "origin/main";
if (!consumer) throw new Error("Usage: node tools/prove-reflex.mjs <Reflex checkout> [ref]");
function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr ?? ""}`);
  return result.stdout?.trim();
}
// npm's JS entrypoint avoids cmd.exe quoting on Windows paths containing spaces.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run with npm run prove:reflex -- <Reflex checkout> [ref]");
const npm = (args, cwd, capture = false) => run(process.execPath, [npmCli, ...args], cwd, capture);
const sha = run("git", ["rev-parse", `${ref}^{commit}`], resolve(consumer), true);
mkdirSync(join(root, ".proof"), { recursive: true });
const snapshot = mkdtempSync(join(root, ".proof", "reflex-"));
const archive = join(snapshot, "reflex.tar");
run("git", ["archive", "--format=tar", `--output=${archive}`, sha], resolve(consumer));
run("tar", ["-xf", archive, "-C", snapshot], root);
const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", snapshot], root, true));
npm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", join(snapshot, packed[0].filename)], snapshot);
writeFileSync(join(snapshot, "src/shared/game-contract-v1.js"), 'export * from "@partybeam/game-sdk";\n');
console.log(`Reflex ${sha}; packed SDK ${packed[0].shasum}; snapshot ${snapshot}`);
npm(["test"], snapshot);
