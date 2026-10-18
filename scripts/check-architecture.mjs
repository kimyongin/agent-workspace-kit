import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "kits/marketplace/src");
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
}
await collect(source);
const known = new Set(files);
const entries = new Set(["index.ts", "types.ts", "coupang.ts", "naver.ts"]);
function layer(file) {
  const path = relative(source, file).split(sep).join("/");
  if (entries.has(path)) return "composition";
  const first = path.split("/")[0];
  if (["domain", "application", "adapters"].includes(first)) return first;
  throw new Error(`Unclassified SDK source: ${path}`);
}
const allowed = {
  domain: new Set(["domain"]),
  application: new Set(["domain", "application"]),
  adapters: new Set(["domain", "application", "adapters"]),
  composition: new Set(["domain", "application", "adapters", "composition"]),
};
let edges = 0;
for (const file of files) {
  const from = layer(file);
  const name = relative(root, file);
  const ast = ts.createSourceFile(
    file,
    await readFile(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function check(specifier) {
    if (!specifier || !ts.isStringLiteralLike(specifier)) {
      throw new Error(`Nonliteral module reference: ${name}`);
    }
    const value = specifier.text;
    if (!value.startsWith(".")) {
      if (from === "domain" || from === "application") {
        throw new Error(`Core imports external module: ${name} -> ${value}`);
      }
      return;
    }
    const target = resolve(dirname(file), value.replace(/\.js$/, ".ts"));
    if (!known.has(target)) {
      throw new Error(
        `Module must resolve inside SDK source: ${name} -> ${value}`,
      );
    }
    if (!allowed[from].has(layer(target))) {
      throw new Error(`Outward dependency: ${name} -> ${value}`);
    }
    edges++;
  }
  function visit(node) {
    if (
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
    ) {
      if (node.moduleSpecifier) check(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node)) {
      check(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      check(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      check(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
console.log(
  `Validated SDK architecture: ${files.length} files, ${edges} imports`,
);
