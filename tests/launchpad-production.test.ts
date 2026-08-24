import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../public/launchpad/bitbt-launch-ui-app.html", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../public/launchpad/launchpad-live.js", import.meta.url), "utf8");

test("production Launchpad HTML has no executable prototype data layer", () => {
  for (const marker of ["CASHCAT", "MOONBUN", "BITBULL", "2.840", "1,168,420", "Math.sin", "Math.cos", "tokenCatalog", "candleData", "renderActiveToken", "applyTradeSide"]) {
    assert.equal(html.includes(marker), false, `prototype marker remains: ${marker}`);
  }
  assert.equal(/<script>/.test(html), false);
  assert.match(html, /launchpad-live\.js/);
});

test("production bridge invalidates provider state and binds quotes", () => {
  for (const marker of ["accountsChanged", "chainChanged", "assertProviderState", "assertQuoteBinding", "expiresAt", "quoteTokenAddress", "minOut"]) {
    assert.match(bridge, new RegExp(marker));
  }
  assert.equal(bridge.includes("state.quote = response"), false);
  assert.equal(bridge.includes("Math.sin"), false);
});
