import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import postcss from "postcss";

const html = fs.readFileSync("public/launchpad/bitbt-launch-ui-app.html", "utf8");
const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);

test("all production inline CSS parses and header rules remain at stylesheet scope", () => {
  const roots = styles.map(css => postcss.parse(css));
  for (const selector of [".network-switch-shell", ".network-switch > img", ".network-menu", "body.runtime-pending #bitbt-launch"]) {
    const rules = roots.flatMap(root => root.nodes.filter(node => node.type === "rule" && node.selector === selector));
    assert.ok(rules.length, `${selector} must not be trapped inside another rule or mobile media query`);
  }
  assert.throws(() => postcss.parse(":root { font-synthesis: none; .network-menu { display: none; }"));
});

test("CSS validation runs before building or testing browser bundles", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.ok(pkg.scripts.build.startsWith("npm run check:css &&"));
  assert.ok(pkg.scripts.pretest.startsWith("npm run check:css &&"));
});

test("header dropdown escapes sibling stacking contexts and exposes both networks", () => {
  const headers = styles.flatMap(css => postcss.parse(css).nodes.filter(node => node.type === "rule" && node.selector === ".studio-head"));
  const layers = headers.flatMap(rule => rule.nodes.filter(node => node.type === "decl" && node.prop === "z-index").map(node => Number(node.value)));
  assert.equal(layers.at(-1), 100);
  assert.match(html, /data-global-chain-option="bsc"/);
  assert.match(html, /data-global-chain-option="robinhood"/);
});
