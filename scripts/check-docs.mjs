import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let count = 0;
let links = 0;
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") || entry.name === "node_modules" ||
      entry.name === "dist"
    ) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.name.endsWith(".md")) {
      const bytes = await readFile(path);
      if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        throw new Error(`BOM: ${path}`);
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\r") || !text.endsWith("\n")) {
        throw new Error(`Expected LF with final newline: ${path}`);
      }
      if ((text.match(/^```/gm) ?? []).length % 2 !== 0) {
        throw new Error(`Unclosed code block: ${path}`);
      }
      for (const [, href] of text.matchAll(/\]\(([^)]+)\)/g)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
        const target = resolve(
          dirname(path),
          decodeURIComponent(href.split("#")[0]),
        );
        const local = relative(root, target);
        if (local.startsWith("..") || isAbsolute(local)) {
          throw new Error(`Outside repository: ${path}: ${href}`);
        }
        await stat(target).catch(() => {
          throw new Error(`Broken link: ${path}: ${href}`);
        });
        links++;
      }
      count++;
    }
  }
}
await visit(root);
console.log(`Validated ${count} Markdown files and ${links} relative links`);
