import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await rm(resolve(root, "kits/marketplace/dist"), {
  recursive: true,
  force: true,
});
execFileSync(process.execPath, [
  resolve(root, "node_modules/typescript/bin/tsc"),
  "-p",
  "kits/marketplace/tsconfig.json",
], { cwd: root, stdio: "inherit" });
