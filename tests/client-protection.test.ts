import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const protector = fs.readFileSync(path.join(root, "scripts/protect-client.mjs"), "utf8");
const deploy = fs.readFileSync(path.join(root, "deploy/deploy-server.sh"), "utf8");
const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");

test("production build generates protected browser bundles", () => {
  assert.match(packageJson.scripts.build, /protect:client/);
  assert.equal(packageJson.devDependencies["javascript-obfuscator"], "5.7.0");
  assert.match(protector, /controlFlowFlattening:\s*true/);
  assert.match(protector, /controlFlowFlatteningThreshold:\s*0\.85/);
  assert.match(protector, /sourceMap:\s*false/);
  assert.match(protector, /renameProperties:\s*false/);
  assert.match(protector, /listJavaScript/);
  assert.match(protector, /contains inline JavaScript/);
  assert.match(protector, /assets\/vendor\//);
  assert.match(nextConfig, /productionBrowserSourceMaps:\s*false/);
});

test("release replaces raw scripts and rejects source maps", () => {
  assert.match(deploy, /\.next\/protected-public/);
  assert.match(deploy, /cmp -s/);
  assert.match(deploy, /\.next\/client-protection-manifest\.json/);
  assert.match(deploy, /sourceMappingURL=/);
  assert.match(deploy, /bitbt-ui-20260911-candidate\.html/);
  assert.match(deploy, /bitbt-ui-20260911-preview\.html/);
});
