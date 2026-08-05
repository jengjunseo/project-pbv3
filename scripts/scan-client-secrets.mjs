import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sourceRoot = join(root, "src");
const forbidden = [
  /SUPABASE_SECRET/i,
  /sb_secret_/i,
  /service_role/i,
  /NEXT_PUBLIC_SUPABASE/i,
  /\/rest\/v1/i,
  /\/storage\/v1/i,
  /Authorization\s*:/i,
];

const files = await walk(sourceRoot);
const leaks = [];
for (const file of files) {
  if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(file))) continue;
  const text = await readFile(file, "utf8");
  if (!/^\s*["']use client["'];/m.test(text)) continue;
  for (const pattern of forbidden) {
    if (pattern.test(text)) leaks.push(`${relative(root, file)} matched ${pattern}`);
  }
}

if (leaks.length) {
  console.error(leaks.join("\n"));
  process.exit(1);
}
console.log(`client secret scan passed (${files.length} source files inspected)`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else output.push(path);
  }
  return output;
}
