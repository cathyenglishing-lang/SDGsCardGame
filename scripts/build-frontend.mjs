import { cp, mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(rootDir, "frontend");
const outputDir = resolve(rootDir, "dist");
const apiBaseUrl = process.env.API_BASE_URL || process.env.VITE_API_BASE_URL || "";

// The card game's question bank must pass its checks before anything is built (scripts/validate-content.mjs).
const { run: validateContent } = await import("./validate-content.mjs");
if (!validateContent({ quiet: true })) {
  console.error("\nBuild stopped: fix the question bank errors above (frontend/js/pk-content.js).");
  process.exit(1);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });
await cp(sourceDir, resolve(outputDir, "static"), { recursive: true });

const configSource = `window.CARDLEARN_API_BASE_URL = ${JSON.stringify(apiBaseUrl)} || "http://127.0.0.1:8000";\n`;
await writeFile(resolve(outputDir, "config.js"), configSource, "utf8");
await writeFile(resolve(outputDir, "static", "config.js"), configSource, "utf8");

console.log(`Built static frontend to ${outputDir}`);
