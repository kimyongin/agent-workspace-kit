import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, ".artifacts");
await mkdir(artifacts, { recursive: true });
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: "inherit" });
const packed = JSON.parse(
  execFileSync("npm", [
    "pack",
    "--workspace",
    "kits/marketplace",
    "--pack-destination",
    artifacts,
    "--json",
  ], { cwd: root, encoding: "utf8" }),
);
if (packed.length !== 1) throw new Error("Expected one marketplace package");
const files = packed[0].files.map((file) => file.path);
for (
  const entry of [
    "dist/index.js",
    "dist/types.d.ts",
    "dist/coupang.js",
    "dist/naver.js",
    "README.md",
  ]
) {
  if (!files.includes(entry)) {
    throw new Error(`Missing package entry: ${entry}`);
  }
}
if (
  files.some((path) => /(^|\/)(src|tests|node_modules|\.env)(\/|$)/.test(path))
) {
  throw new Error("Package includes private source, fixtures or configuration");
}
const artifact = join(artifacts, packed[0].filename);
const hash = createHash("sha256").update(await readFile(artifact)).digest(
  "hex",
);
await writeFile(artifact + ".sha256", `${hash}  ${packed[0].filename}\n`);
const consumer = await mkdtemp(join(tmpdir(), "marketplace-consumer-"));
try {
  await copyFile(artifact, join(consumer, "marketplace.tgz"));
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "@kimyongin/marketplace-kit": "file:./marketplace.tgz",
        },
      },
      null,
      2,
    ) + "\n",
  );
  await copyFile(
    join(root, "examples/read-orders.mjs"),
    join(consumer, "read-orders.mjs"),
  );
  await copyFile(
    join(root, "examples/types-consumer.mts"),
    join(consumer, "types-consumer.mts"),
  );
  await cp(
    join(root, "kits/marketplace/tests/fixtures"),
    join(consumer, "fixtures"),
    { recursive: true },
  );
  await writeFile(join(consumer, "deno.json"), '{"nodeModulesDir":"manual"}\n');
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    consumer,
  );
  run(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "--strict",
    "--noEmit",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--target",
    "ES2022",
    "types-consumer.mts",
  ], consumer);
  run(process.execPath, ["read-orders.mjs"], consumer);
  const deno = process.env.DENO_BIN ?? "deno";
  run(deno, ["check", "types-consumer.mts"], consumer);
  run(deno, ["run", "--allow-read", "read-orders.mjs"], consumer);
  console.log(`Package consumer verification passed; SHA-256 ${hash}`);
} finally {
  await rm(consumer, { recursive: true, force: true });
}
