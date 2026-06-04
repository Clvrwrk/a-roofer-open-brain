import { accessSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const files = ["index.html", "src/app.js", "src/styles.css", "package.json"];

for (const file of files) {
  accessSync(join(root, file));
}

const html = readFileSync(join(root, "index.html"), "utf8");
const js = readFileSync(join(root, "src/app.js"), "utf8");
const css = readFileSync(join(root, "src/styles.css"), "utf8");

const checks = [
  [html.includes("src/app.js"), "index includes app.js"],
  [html.includes("src/styles.css"), "index includes styles.css"],
  [js.includes("credit_memo_request.approve"), "approval action id present"],
  [js.includes("product_match.approve"), "product match action id present"],
  [css.includes("--color-primary") && css.includes("--color-tertiary"), "DESIGN.md brand tokens present"],
  [css.includes("#11133f"), "deep-navy primary token wired"],
];

const failed = checks.filter(([pass]) => !pass);
if (failed.length) {
  for (const [, label] of failed) console.error(`failed: ${label}`);
  process.exit(1);
}

console.log("check ok");
