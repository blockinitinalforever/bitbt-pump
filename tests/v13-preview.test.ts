import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseHTML } from 'linkedom';

const previewPath = 'public/launchpad/bitbt-launch-ui-app-v13.html';

test('v13 preview uses the production adapter and fails closed for unsupported order types', () => {
  const html = fs.readFileSync(previewPath, 'utf8');
  const { document } = parseHTML(html);
  const root = document.querySelector('#bitbt-launch');

  assert.equal(root?.getAttribute('data-ui-version'), '20260911');
  assert.equal(root?.getAttribute('data-ui-preview'), 'v13');
  assert.equal(document.querySelectorAll('.perps-order-tabs [data-perps-order]').length, 1);
  assert.equal(document.querySelectorAll('.perps-toolbar [data-perps-mode]').length, 1);
  assert.ok(document.querySelector('[data-perps-leverage-range]'));
  assert.ok(document.querySelector('[data-perps-settlement-note]'));
  assert.ok(document.querySelector('[data-panel="perps-onchain"] .onchain-ledger'));
  assert.equal(document.querySelector('.connect-global [data-wallet-copy]')?.textContent, '连接钱包');
  assert.ok(document.querySelector('[data-panel="live"] [data-market-stream-status]'));
  assert.equal(document.querySelector('[data-panel="live"] [data-filter-value="create"]')?.textContent, '新币');
  assert.equal(document.querySelectorAll('[data-panel="rank"] [data-rank-filter]').length, 7);
  assert.equal(document.querySelectorAll('[data-panel="rank"] [data-rank-window]').length, 5);
  assert.doesNotMatch(html, /const tokenCatalog|const perpsCatalog/);
  assert.match(html, /<script src="\.\/launchpad-live\.js"><\/script>/);
});

test('v13 is the current production entry while the legacy inner shell remains available for rollback', () => {
  const wrapper = fs.readFileSync('public/launchpad/bitbt-wallet-ui-v13.html', 'utf8');
  const production = fs.readFileSync('public/launchpad/bitbt-wallet-ui.html', 'utf8');

  assert.match(wrapper, /bitbt-launch-ui-app-v13\.html/);
  assert.match(production, /bitbt-launch-ui-app-v13\.html/);
  assert.ok(fs.existsSync('public/launchpad/bitbt-launch-ui-app.html'));
});

test('live adapter sanitizes v13 sample leverage claims and supports its history metrics', () => {
  const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
  assert.match(source, /\.record-overview > div, \.onchain-kpis > article/);
  assert.match(source, /Keeper 待命是正常按需状态，不代表后台故障/);
  assert.match(source, /1\[–-\]100×/);
});

test('v13 live and ranking rows reset native button chrome and stay full width', () => {
  const html = fs.readFileSync(previewPath, 'utf8');
  assert.match(html, /button\.live-row,#bitbt-launch button\.rank-row\{box-sizing:border-box;width:100%/);
  assert.match(html, /button\.rank-row\{grid-template-columns:24px 38px minmax\(0,1fr\)/);
  assert.match(html, /button\.live-row\{grid-template-columns:38px minmax\(0,1fr\) auto/);
});
