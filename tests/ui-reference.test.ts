import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { compareUi, referencePath } from '../scripts/audit-ui-reference.mjs';

type UiLocale = {
  apply(language: 'en' | 'zh'): void;
  message(value: string, language: 'en' | 'zh'): string;
};

function renderLocale(language: () => string = () => 'zh') {
  const {document, window} = parseHTML('<main id="bitbt-launch"></main>');
  vm.runInNewContext(fs.readFileSync('public/launchpad/ui-locale.js','utf8'), {window,document});
  const source = fs.readFileSync('src/client/launchpad-live.js','utf8');
  const helpers = source.slice(source.indexOf('  const uiCopy ='), source.indexOf('  const readAnnouncementIds'));
  return vm.runInNewContext(helpers + ';({uiCopy,uiMarkup})', {window,pumpLocale:language});
}

test('dynamic translation touches source literals, never interpolated token names or amounts', () => {
  const helpers = renderLocale(() => 'en');
  const name = '我的买入代币';
  const markup = helpers.uiMarkup(['<strong>市值</strong><span>', '</span><b>', '</b>'], name, '0.0000000123');
  assert.equal(markup, '<strong>Market cap</strong><span>我的买入代币</span><b>0.0000000123</b>');
});

test('display preferences persist safe whitelisted values and do not round transaction amounts', () => {
  const source = fs.readFileSync('src/client/launchpad-live.js','utf8');
  const preferences = new Map<string,string>();
  const scope = vm.createContext({readLocalPreference:(key:string)=>preferences.get(key)||''});
  vm.runInContext(source.slice(source.indexOf('  const displayPrecision ='),source.indexOf('  const state =')) + ';globalThis.format=displayPrice;globalThis.zone=displayTimeZone;',scope);
  assert.equal(scope.format('0.0000000123','raw'),'raw');
  preferences.set('bitbt_price_precision','6');
  assert.equal(scope.format('0.0000000123','raw'),'<0.000001');
  assert.equal(scope.format('1.2','raw'),'1.200000');
  preferences.set('bitbt_price_precision','300');
  assert.equal(scope.format('1.2','raw'),'raw');
  preferences.set('bitbt_time_zone','bad/zone');assert.equal(scope.zone(),undefined);
  preferences.set('bitbt_time_zone','America/New_York');assert.equal(scope.zone(),'America/New_York');
  assert.match(source,/renderSelected\(\{ refreshQuote: false \}\)/);
  assert.match(source,/if \(refreshQuote\) updateQuote\(\)/);
});

test('detail restores four reference metrics without dropping expanded data or signing fields', () => {
  const {document}=parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html','utf8'));
  const detail=document.querySelector('[data-panel="detail"]')!;
  assert.equal(detail.querySelector('.stats-grid')!.children.length,4);
  assert.ok(detail.querySelector('[data-detail-panel="data"] [data-active-fdv]'));
  assert.ok(detail.querySelector('[data-detail-panel="data"] [data-token-project-summary]'));
  const review=document.querySelector('[data-panel="create-review"]')!;
  assert.equal(review.querySelectorAll(':scope > .review-block').length,3);
  for(const key of ['predicted','recipient','factory','id','salt']) assert.ok(review.querySelector('[data-launch-signature-details] [data-launch-review-'+key+']'));
  const settings=document.querySelector('[data-panel="language-center"]')!;
  assert.equal(settings.querySelectorAll('select[disabled]').length,0);
  assert.equal(settings.querySelectorAll('[data-display-precision] option').length,3);
  const source=fs.readFileSync('src/client/launchpad-live.js','utf8');
  assert.match(source,/text\("\[data-launch-review-quote\]", prepared.launch.quote_token\)/);
});

test('reference language switching preserves live text, input values and event-bound elements', () => {
  const {window,document} = parseHTML('<html><body><main id="bitbt-launch"><button id="static">创建代币</button><span id="live">连接钱包</span><input value="我的代币" placeholder="合约地址"></main></body></html>');
  vm.runInNewContext(fs.readFileSync('public/launchpad/ui-locale.js', 'utf8'), {window,document});
  const locale = (window as unknown as { bitbtUiLocale: { apply(language: 'en' | 'zh'): void } }).bitbtUiLocale;
  const button = document.querySelector('#static');
  document.querySelector('#live')!.textContent = '0x1111…1111';
  locale.apply('en');
  assert.equal(button!.textContent, 'Create Token');
  assert.equal(document.querySelector('#live')!.textContent, '0x1111…1111');
  assert.equal(document.querySelector('input')!.getAttribute('value'), '我的代币');
  locale.apply('zh');
  assert.equal(button, document.querySelector('#static'));
  assert.equal(button!.textContent, '创建代币');
  assert.equal(document.querySelector('#live')!.textContent, '0x1111…1111');
});

test('network and contact translations preserve destinations and both language directions', () => {
  const {window,document}=parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html','utf8'));
  vm.runInNewContext(fs.readFileSync('public/launchpad/ui-locale.js','utf8'),{window,document});
  const locale=(window as unknown as { bitbtUiLocale: UiLocale }).bitbtUiLocale;
  const contacts=[...document.querySelectorAll('[data-global-official-contacts] a')];
  const hrefs=contacts.map(n=>n.getAttribute('href'));
  locale.apply('en');
  assert.equal(contacts[0].querySelector('span')!.textContent,'Website');
  assert.equal(contacts[1].querySelector('span')!.textContent,'Email');
  assert.doesNotMatch(document.querySelector('.launch-chain-picker .chain-note')!.textContent!,/[\u3400-\u9fff]/);
  assert.match(document.querySelector('.launch-chain-picker .chain-note')!.textContent!,/on BNB Chain,/);
  assert.match(document.querySelector('[data-launch-chain="bnb"] small')!.textContent!,/PancakeSwap migration/);
  locale.apply('zh');
  assert.equal(contacts[0].querySelector('span')!.textContent,'官网');
  assert.equal(contacts[1].querySelector('span')!.textContent,'邮箱');
  assert.deepEqual(contacts.map(n=>n.getAttribute('href')),hrefs);
});

test('all fixed friendly errors have English copy; numeric diagnostics and unknown details are retained', () => {
  const {window,document}=parseHTML('<main id="bitbt-launch"></main>');
  vm.runInNewContext(fs.readFileSync('public/launchpad/ui-locale.js','utf8'),{window,document});
  const locale=(window as unknown as { bitbtUiLocale: UiLocale }).bitbtUiLocale;
  const source=fs.readFileSync('src/client/launchpad-live.js','utf8');
  const errors=source.slice(source.indexOf('  const friendlyError ='),source.indexOf('  const api ='));
  const messages=[...errors.matchAll(/return "([^"]+)"/g)].map(m=>m[1]);
  assert.ok(messages.length>=20);
  for(const raw of messages){assert.doesNotMatch(locale.message(raw,'en'),/[\u3400-\u9fff]/,raw);assert.equal(locale.message(raw,'zh'),raw);}
  const limit='开仓金额超出单仓上限：100 × 10 = 1000，当前上限为 100。请把保证金降至 10 以下，或降低杠杆。';
  assert.equal(locale.message(limit,'en'),'Position limit exceeded: 100 × 10 = 1000; current limit: 100. Reduce collateral to at most 10, or reduce leverage.');
  const balance='BNB 余额不足：当前 0.001 BNB，发射费和预估 Gas 至少需要 0.012 BNB，还差 0.011 BNB';
  assert.equal(locale.message(balance,'en'),'Insufficient BNB balance: available 0.001 BNB; launch fee and estimated Gas require at least 0.012 BNB; shortfall 0.011 BNB.');
  const unknown='未知错误 0x1234 金额 0.003';
  assert.equal(locale.message(unknown,'en'),'Reported details (original):\n'+unknown);
  assert.equal(locale.message('RPC reverted: 0x1234','en'),'RPC reverted: 0x1234');
});

test('public perpetual config survives SIWE restoration while private reads remain session-bound', () => {
  const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
  const start = source.indexOf('  const perpReadVersions = new Map();');
  const end = source.indexOf('  const setPerpReadError', start);
  assert.ok(start > 0 && end > start);
  const scope = vm.createContext({ ...renderLocale(),});
  vm.runInContext(`const state = {account:'', selectedChain:'bsc', selectedPerpMarketId:7}; let walletSessionEpoch = 0; const selectedProvider = () => null; ${source.slice(start, end)}
    const publicRead = beginPerpRead('config', false);
    const positionRead = beginPerpRead('position');
    const historyRead = beginPerpRead('history', false);
    state.account = 'wallet-A'; walletSessionEpoch++;
    globalThis.restored = [publicRead(), positionRead(), historyRead()];
    state.selectedChain = 'robinhood'; globalThis.changedChain = publicRead();
    state.selectedChain = 'bsc'; beginPerpRead('config', false); globalThis.superseded = publicRead();`, scope);
  assert.deepEqual(Array.from(scope.restored), [true, false, false]);
  assert.equal(scope.changedChain, false);
  assert.equal(scope.superseded, false);
});

test('original UI baseline preserves all 28 panels and three original style blocks', () => {
  const result = compareUi(referencePath);
  assert.equal(result.panels.length, 28);
  assert.equal(result.styles.length, 3);
  assert.deepEqual(result.missingPanels, []);
  assert.deepEqual(result.extraPanels, []);
  assert.ok(result.styles.every(style => style.identical));
  assert.ok(result.panels.every(panel => panel.identicalLayout));
});

test('production retains the three original CSS blocks byte-for-byte', () => {
  const report = compareUi(path.resolve('public/launchpad/bitbt-launch-ui-app.html'));
  assert.ok(report.styles.every(style => style.identical));
});

test('public iframe wrapper never forces a 720px frame into a shorter viewport', () => {
  const shell=fs.readFileSync('public/launchpad/bitbt-wallet-ui.html','utf8');
  assert.doesNotMatch(shell,/min-height:\s*720px/);
  assert.match(shell,/height:calc\(100dvh - 24px\);min-height:0/);
  assert.match(shell,/sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"/);
});

test('optional launch fields preserve IDs and handlers while matching the primary reference field order', () => {
  const {document}=parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html','utf8'));
  const panel=document.querySelector('[data-panel="create-basic"]')!;
  const extras=panel.querySelector('[data-launch-extra-fields]')!;
  assert.equal(extras.tagName,'DETAILS');
  assert.ok(!extras.hasAttribute('open'));
  for(const id of ['token-classification','token-discord']) {
    assert.ok(extras.querySelector('#'+id));
    assert.equal(document.querySelectorAll('#'+id).length,1);
  }
  const primary=[...panel.querySelectorAll(':scope > div.form-group input, :scope > div.form-group textarea')].map(n=>n.id);
  assert.deepEqual(primary,['token-name','token-symbol','token-story','token-twitter','token-telegram','token-website']);
});

test('dynamic market copy switches language without touching quantities or making network requests', () => {
  const {document}=parseHTML('<span data-market-total></span><span data-market-spot-count></span><span data-market-stream-status></span><span data-api-status></span>');
  let language='zh';
  const source=fs.readFileSync('src/client/launchpad-live.js','utf8');
  const start=source.indexOf('  const renderMarketSummary =');
  const end=source.indexOf('  const renderLiveRows',start);
  const scope=vm.createContext({ ...renderLocale(() => language),state:{marketSummary:{total_tokens:26},tokens:[],marketActivity:[{},{}]},uiCopy:(zh:string,en:string)=>language==='zh'?zh:en,selectedNetwork:()=>({shortName:'BNB Chain'}),$:(s:string)=>document.querySelector(s),text:(s:string,v:string)=>document.querySelectorAll(s).forEach(n=>n.textContent=v)});
  vm.runInContext(source.slice(start,end)+'\nglobalThis.render=renderMarketSummary;render();',scope);
  assert.match(document.querySelector('[data-api-status]')!.textContent!,/26 个项目/);
  language='en';scope.render();
  assert.equal(document.querySelector('[data-market-total]')!.textContent,'26');
  assert.equal(document.querySelector('[data-api-status]')!.textContent,'Live Pump data connected · 26 projects · 2 recent events');
  language='zh';scope.render();
  assert.match(document.querySelector('[data-market-stream-status]')!.textContent!,/最近 2 条真实动态/);
});

test('real announcement detail precedes the list and handles selection, escaping and empty categories', () => {
  const {document} = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html','utf8'));
  const source=fs.readFileSync('src/client/launchpad-live.js','utf8');
  const start=source.indexOf('  const renderAnnouncements =');
  const end=source.indexOf('  const loadAnnouncements',start);
  const state={announcements:[{id:'a',title:'<img src=x>',content:'First',category:'product',pinned:true,published_at:'today'},{id:'b',title:'Second',content:'Second body',category:'security',pinned:false,published_at:'today'}],announcementFilter:'all',selectedAnnouncementId:''};
  let read=new Set<string>();
  const scope=vm.createContext({ ...renderLocale(),state,$:(s:string)=>document.querySelector(s),text:(s:string,v:string)=>document.querySelectorAll(s).forEach(n=>n.textContent=v),readAnnouncementIds:()=>read,saveReadAnnouncementIds:(ids:Set<string>)=>{read=ids;},pumpLocale:()=> 'zh',announcementCopy:(x:unknown)=>x,announcementCategory:(x:string)=>x,formatDate:(x:string)=>x,escapeHtml:(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')});
  vm.runInContext(source.slice(start,end)+'\nglobalThis.render=renderAnnouncements;render();',scope);
  const detail=document.querySelector('[data-live-announcement-detail]')!;
  assert.equal(detail.nextElementSibling!.className,'section-title');
  assert.equal(detail.nextElementSibling!.nextElementSibling!.className,'announcement-list');
  assert.equal(detail.querySelector('h2')!.textContent,'<img src=x>');
  assert.equal(detail.querySelector('img'),null);
  document.querySelector('[data-announcement-id="b"]')!.dispatchEvent(new document.defaultView!.Event('click'));
  assert.equal(detail.querySelector('h2')!.textContent,'Second');
  assert.ok(read.has('b'));
  assert.equal(document.querySelectorAll('.announcement-list .announcement-detail').length,0);
  state.announcementFilter='campaign';scope.render();
  assert.ok(detail.hasAttribute('hidden'));
  assert.equal(detail.textContent,'');
  assert.equal(document.querySelector('[data-announcement-count]')!.textContent,'0 条 · 0 条未读');
  assert.match(source,/announcement-detail:not\(\[data-live-announcement-detail\]\)/);
});

test('live hidden state takes priority over original flex and grid layout without altering baseline CSS', () => {
  const { document } = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  const extension = document.querySelector('#bitbt-live-extensions')!.textContent;
  assert.match(extension, /#bitbt-launch\s+\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.ok(document.querySelector('[data-launch-quote="ETH"]')!.hasAttribute('hidden'));
  assert.ok(document.querySelector('[data-custom-curve-fields]')!.hasAttribute('hidden'));
  assert.ok(compareUi(path.resolve('public/launchpad/bitbt-launch-ui-app.html')).styles.every(style => style.identical));
});

test('launch draft preview retains entered identity while signed review and publish permission reset', () => {
  const {document} = parseHTML('<input id="token-name" value="My Meme"><input id="token-symbol" value="meme"><span data-preview-name></span><span data-preview-ticker></span><span data-preview-symbol></span><span data-launch-review-name>Old signed name</span><button data-launch-publish></button>');
  const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
  const start = source.indexOf('  const renderLaunchDraftPreview =');
  const end = source.indexOf('  const invalidateLaunchSnapshot', start);
  assert.ok(start > 0 && end > start);
  const scope = vm.createContext({ ...renderLocale(),state:{launchTerminal:false}, $:(selector:string)=>document.querySelector(selector), text:(selector:string,value:string)=>document.querySelectorAll(selector).forEach(node=>node.textContent=value)});
  vm.runInContext(source.slice(start,end) + '\nclearLaunchReview();',scope);
  assert.equal(document.querySelector('[data-preview-name]')!.textContent, 'My Meme');
  assert.equal(document.querySelector('[data-preview-ticker]')!.textContent, 'MEME');
  assert.equal(document.querySelector('[data-preview-symbol]')!.textContent, 'ME');
  assert.equal(document.querySelector('[data-launch-review-name]')!.textContent, '—');
  assert.ok(document.querySelector('[data-launch-publish]')!.hasAttribute('disabled'));
});

test('original account entries resolve to existing real features', () => {
  const source = fs.readFileSync(path.resolve('src/client/launchpad-live.js'), 'utf8');
  const { document } = parseHTML(fs.readFileSync(path.resolve('public/launchpad/bitbt-launch-ui-app.html'), 'utf8'));
  const root = document.querySelector('#bitbt-launch');
  const start = source.indexOf('  const screenAliases');
  const end = source.indexOf('  const routeScreen', start);
  const context = vm.createContext({ ...renderLocale(), root, CSS: { escape: (value: string) => value } });
  const resolve = vm.runInContext(source.slice(start, end) + '\nresolveScreenName', context);
  for (const [legacy, canonical] of Object.entries({ 'revenue-center':'income-center', 'developer-center':'developer-tools', growth:'invite-center', alerts:'alert-center' })) {
    assert.equal(resolve(legacy), canonical);
    assert.ok(document.querySelector(`[data-panel="${canonical}"]`));
  }
  for (const button of document.querySelectorAll('[data-panel="profile"] [data-open]')) {
    const name = resolve(button.getAttribute('data-open'));
    assert.ok(document.querySelector(`[data-panel="${name}"]`), `missing route ${name}`);
  }
  assert.ok(document.querySelector('[data-panel="profile"] [data-open="perpetual"]'), 'advanced perpetual operations must stay reachable');
});

test('mobile bottom navigation exactly matches the delivered five tabs and icons', () => {
  const original = parseHTML(fs.readFileSync(referencePath, 'utf8')).document;
  const current = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8')).document;
  assert.equal(current.querySelector('.bottom-nav')!.outerHTML, original.querySelector('.bottom-nav')!.outerHTML);
  assert.equal(current.querySelectorAll('.bottom-nav > button').length, 5);
  assert.ok(current.querySelector('.screen-switcher [data-open="perps"]'), 'perpetual entry must stay reachable');
});

test('bottom navigation visibility follows the original five main screens, not transaction subpages', () => {
  const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
  const {document} = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  const start = source.indexOf('  const mainScreens =');
  const end = source.indexOf('  const show =', start);
  const apply = vm.runInNewContext(source.slice(start, end) + ';applyScreenChrome', {$:(s:string)=>document.querySelector(s),$$:(s:string)=>[...document.querySelectorAll(s)]});
  for (const name of ['discover','live','rank','create-mode','profile']) {
    apply(name);
    assert.equal(document.querySelector('.bottom-nav')!.classList.contains('visible'), true);
    assert.equal(document.querySelectorAll('.has-bottom-nav').length, 1);
  }
  for (const name of ['detail','trade','perps','create-basic','create-economics','create-tax','create-review','perps-create-pool']) {
    apply(name);
    assert.equal(document.querySelector('.bottom-nav')!.classList.contains('visible'), false);
    assert.equal(document.querySelectorAll('.has-bottom-nav').length, 0);
  }
});

test('discover search filters perpetual cards locally without overwriting spot cards', () => {
  const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
  const { document } = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  const spot = document.querySelector('[data-live-token-grid]')!;
  const previous = spot.innerHTML;
  const state = { tokenSearch: 'alpha', selectedChain: 'robinhood', perpConfig: {}, perpMarkets: [
    { marketId: 0, tokenSymbol: 'ALPHA', quoteTokenSymbol: 'tBTUSD', enabled: true },
    { marketId: 1, tokenSymbol: 'BETA', quoteTokenSymbol: 'tBTUSD', enabled: true },
  ] };
  const start = source.indexOf('  const renderPerpetualMarketCards =');
  const end = source.indexOf('  let perpUnreadySince', start);
  const context = vm.createContext({ ...renderLocale(), state, $: (selector: string) => document.querySelector(selector), escapeHtml: (v: unknown) => String(v), short: (v: string) => v, formatUnits: (v: bigint) => String(v), perpetualPairLabel: (market: {tokenSymbol: string; quoteTokenSymbol: string}) => `${market.tokenSymbol}/${market.quoteTokenSymbol}` });
  const render = vm.runInContext(source.slice(start, end) + '\nrenderPerpetualMarketCards', context);
  render();
  const grid = document.querySelector('[data-market-panel="perps"] .token-grid')!;
  assert.equal(grid.querySelectorAll('[data-perp-market-id]').length, 1);
  assert.match(grid.textContent || '', /ALPHA\/tBTUSD/);
  assert.match(grid.textContent || '', /Robinhood/);
  assert.doesNotMatch(grid.textContent || '', /BETA\/tBTUSD|BNB Chain/);
  state.tokenSearch = 'missing'; render();
  assert.match(grid.textContent || '', /没有匹配/);
  assert.equal(spot.innerHTML, previous);
  assert.equal(state.perpMarkets.length, 2);
});

test('live market cards retain the September 14 reference hierarchy after real data renders', () => {
  const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
  const differenceStart = source.indexOf('  const exactDecimalDifference =');
  const differenceEnd = source.indexOf('  const hasNumber =', differenceStart);
  assert.ok(differenceStart > 0 && differenceEnd > differenceStart);
  const { exactDecimalDifference, formatExactDecimal } = vm.runInNewContext(source.slice(differenceStart, differenceEnd) + ';({exactDecimalDifference,formatExactDecimal})');
  const start = source.indexOf('  const tokenCard =');
  const end = source.indexOf('  const renderTokens =', start);
  assert.ok(start > 0 && end > start);
  const scope = vm.createContext({
    ...renderLocale(),
    number: (value: unknown) => Number(value || 0),
    tokenAddress: (token: { contract_address?: string }) => token.contract_address || '',
    assetImage: () => '/real-token.png',
    tokenIsMigrated: (token: { status?: string }) => token.status === 'migrated',
    tokenTaxPercent: (token: { buy_tax_percent?: number; sell_tax_percent?: number }) => Math.max(token.buy_tax_percent || 0, token.sell_tax_percent || 0),
    hasNumber: (value: unknown) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)),
    escapeHtml: (value: unknown) => String(value),
    usdOrQuote: (usdValue: unknown, quoteValue: unknown, quote: string) => usdValue == null ? `${quoteValue} ${quote}` : `$${usdValue}`,
    decimal: (value: unknown) => String(value ?? '0'),
    exactDecimalDifference,
    formatExactDecimal,
    age: () => '2 分钟前',
  });
  const tokenCard = vm.runInContext(source.slice(start, end) + ';tokenCard', scope) as (token: Record<string, unknown>) => string;
  const common = { contract_address:'0x1', token_name:'Real Token', symbol:'REAL', status:'deployed', submitted_at:'now', progress_percent:43, price_change_24h_percent:86, market_cap_usd:146000, volume_usd_24h:92000, holders_count:884, total_raised_quote:'1.23', migration_threshold_quote:'10', quote_token:'BNB' };
  const normal = parseHTML(`<main>${tokenCard({ ...common, tax_enabled:true, buy_tax_percent:1, sell_tax_percent:3 })}</main>`).document.querySelector('.token-card')!;
  assert.deepEqual([...normal.children].map(node => node.className), ['token-head','card-metrics','curve','curve-label']);
  assert.ok(normal.querySelector('.token-name strong .tag.cyan'));
  assert.equal(normal.querySelector('.card-metrics > div:nth-child(3) span')!.textContent, '持有人');
  assert.equal(normal.querySelector('.card-metrics > div:nth-child(3) strong')!.textContent, '884');
  assert.equal(normal.getAttribute('type'), 'button');
  assert.equal(normal.querySelector('.market-signals'), null);
  const nearMigration = parseHTML(`<main>${tokenCard({ ...common, total_raised_quote:'9.99', migration_threshold_quote:'10', progress_percent:99 })}</main>`).document.querySelector('.token-card')!;
  assert.match(nearMigration.querySelector('.curve-label')!.textContent || '', /还差 0\.01 BNB/);
  const preciseWhole = parseHTML(`<main>${tokenCard({ ...common, total_raised_quote:'9', migration_threshold_quote:'10.000000000000000001' })}</main>`).document.querySelector('.token-card')!;
  assert.match(preciseWhole.querySelector('.curve-label')!.textContent || '', /还差 1\.000000000000000001 BNB/);
  const preciseFraction = parseHTML(`<main>${tokenCard({ ...common, total_raised_quote:'9.999999999999999999', migration_threshold_quote:'10' })}</main>`).document.querySelector('.token-card')!;
  assert.match(preciseFraction.querySelector('.curve-label')!.textContent || '', /还差 0\.000000000000000001 BNB/);
  const preciseLarge = parseHTML(`<main>${tokenCard({ ...common, total_raised_quote:'0', migration_threshold_quote:'1000000000000000000.1' })}</main>`).document.querySelector('.token-card')!;
  assert.match(preciseLarge.querySelector('.curve-label')!.textContent || '', /还差 1,000,000,000,000,000,000\.1 BNB/);
  const directPrecise = parseHTML(`<main>${tokenCard({ ...common, remaining_to_migration_quote:'1.000000000000000001', total_raised_quote:undefined, migration_threshold_quote:undefined })}</main>`).document.querySelector('.token-card')!;
  assert.match(directPrecise.querySelector('.curve-label')!.textContent || '', /还差 1\.000000000000000001 BNB/);
  const unknownRemaining = parseHTML(`<main>${tokenCard({ ...common, total_raised_quote:undefined, migration_threshold_quote:undefined, progress_percent:42 })}</main>`).document.querySelector('.token-card')!;
  assert.match(unknownRemaining.querySelector('.curve-label')!.textContent || '', /还差 — BNB/);
  assert.doesNotMatch(unknownRemaining.querySelector('.curve-label')!.textContent || '', /还差 0 BNB/);
  const migrated = parseHTML(`<main>${tokenCard({ ...common, status:'migrated', dex_profile:'PancakeSwap V3', curve_reserve_usd:184000 })}</main>`).document.querySelector('.token-card')!;
  assert.deepEqual([...migrated.children].map(node => node.className), ['token-head','card-metrics']);
  assert.ok(migrated.querySelector('.token-name strong .tag'));
  assert.equal(migrated.querySelector('.card-metrics > div:nth-child(3) span')!.textContent, '流动性');
});

test('real on-chain rows keep the reference image-copy-badge order and native buttons are visually reset', () => {
  const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
  const start = source.indexOf('  const renderLiveRows =');
  const end = source.indexOf('  const renderRank =', start);
  assert.ok(start > 0 && end > start);
  const { document } = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  const state = { liveFilter:'all', tokens:[{ contract_address:'0x1', logo_url:'/real-token.png' }], marketActivity:[{ activity_type:'buy', token_address:'0x1', trader:'0x1234567890', symbol:'REAL', quote_amount:'1', quote_token:'BNB', token_amount:'2', status:'confirmed', timestamp:1 }] };
  const scope = vm.createContext({
    ...renderLocale(), state,
    $: (selector: string) => document.querySelector(selector),
    tokenAddress: (token: { contract_address?: string }) => token.contract_address || '',
    assetImage: (token: { logo_url?: string }) => token.logo_url || '/fallback.png',
    escapeHtml: (value: unknown) => String(value),
    decimal: (value: unknown) => String(value),
    age: () => '刚刚',
    short: (value: string) => value,
    perpetualPairLabel: (value: { tokenSymbol: string; quoteTokenSymbol?: string }) => `${value.tokenSymbol}/${value.quoteTokenSymbol || 'QUOTE'}`,
    bindLiveTokenSelection: () => undefined,
  });
  const render = vm.runInContext(source.slice(start, end) + ';renderLiveRows', scope) as () => void;
  render();
  const row = document.querySelector('[data-panel="live"] .live-row')!;
  assert.deepEqual([...row.children].map(node => node.tagName), ['IMG','DIV','SPAN']);
  assert.equal(row.querySelector('img')!.getAttribute('src'), '/real-token.png');
  assert.match(row.querySelector('p')!.textContent || '', /0x1234567890 买入 REAL/);
  const html = fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8');
  assert.match(html, /\.screen\[data-panel="live"\] button\.live-row[\s\S]*?width:\s*100%[\s\S]*?background:\s*transparent/);
});

test('profile hides its duplicate contact strip and uses only the global footer', () => {
  const html = fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8');
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll('[data-global-official-contacts]').length, 1);
  assert.equal(document.querySelectorAll('[data-panel="profile"] .profile-support').length, 1);
  assert.match(html, /\.screen\[data-panel="profile"\] \.profile-support\s*\{\s*display:\s*none/);
});

test('discover and ranking controls retain every real sorting option in stable order', () => {
  const { document } = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  assert.deepEqual(
    [...document.querySelectorAll('[data-token-filter]')].map(node => node.getAttribute('data-token-filter')),
    ['trending', 'latest', 'near-migration', 'dex', 'high-tax'],
  );
  assert.deepEqual(
    [...document.querySelectorAll('[data-rank-filter]')].map(node => node.getAttribute('data-rank-filter')),
    ['progress', 'gainers', 'volume', 'net-flow', 'market-cap', 'latest', 'migrated'],
  );
  const html = fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8');
  assert.match(html, /\.screen\[data-panel="rank"\] \.rank-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(7,/);
  assert.match(html, /@media\(max-width:760px\)[\s\S]*?\.screen\[data-panel="rank"\] \.rank-tabs\s*\{[\s\S]*?overflow-x:\s*auto/);
});

test('mobile wallet browsers never auto-zoom text entry controls', () => {
  const html = fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8');
  assert.match(
    html,
    /@media\(max-width:760px\)[\s\S]*?input:not\(\[type="file"\]\)[\s\S]*?textarea,[\s\S]*?select\s*\{[\s\S]*?font-size:\s*16px\s*!important/,
  );
  assert.doesNotMatch(html, /maximum-scale\s*=\s*1|user-scalable\s*=\s*no/);
});

test('every secondary workflow has an explicit return control', () => {
  const { document } = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  const expectedParents: Record<string, string> = {
    announcements: 'discover',
    perps: 'discover',
    'perps-add-contract': 'perps',
    'perps-create-pool': 'perps',
    'perps-pool': 'perps',
    'perps-onchain': 'perps',
    detail: 'discover',
    trade: 'detail',
    'create-mode': 'discover',
    'create-basic': 'create-mode',
    'create-economics': 'create-basic',
    'create-tax': 'create-economics',
    'create-review': 'create-tax',
    success: 'discover',
    'my-launches': 'profile',
    activity: 'profile',
    watchlist: 'profile',
    'alert-center': 'profile',
    'invite-center': 'profile',
    'income-center': 'profile',
    'vault-store': 'income-center',
    'developer-tools': 'profile',
    protection: 'profile',
    'language-center': 'profile',
  };
  for (const [panel, parent] of Object.entries(expectedParents)) {
    const button = document.querySelector(`[data-panel="${panel}"] > .appbar [data-open="${parent}"]`);
    assert.ok(button, `${panel} must return to ${parent}`);
  }
});

test('alert composer uses real token and existing server-supported event types', () => {
  const { document } = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  const panel = document.querySelector('[data-reference-alerts]')!;
  assert.ok(panel.querySelector('.alert-composer'));
  assert.ok(panel.querySelector('[data-alert-create]'));
  assert.deepEqual(Array.from(panel.querySelectorAll('#alert-kind-select option')).map(node => node.getAttribute('value')), ['curve_80', 'curve_90', 'migrated']);
  assert.equal(panel.querySelectorAll('[data-action-confirm]').length, 0);
  assert.equal(panel.querySelectorAll('.ui-switch:not([disabled])').length, 0);
  assert.doesNotMatch(panel.textContent || '', /CASHCAT|MOONBUN|BITBULL/);
});

test('pool detail updates data without replacing the original depth and participant panels', () => {
  const source = fs.readFileSync(path.resolve('src/client/launchpad-live.js'), 'utf8');
  const start = source.indexOf('    const market = state.selectedPerpMarketId == null ? null : selectedPerpMarket();', source.indexOf('  const renderPerpetualServices'));
  const end = source.indexOf('    const activityPanel =', start);
  assert.ok(start > 0 && end > start);
  const { document } = parseHTML(fs.readFileSync(referencePath, 'utf8'));
  const panel = document.querySelector('[data-panel="perps-pool"]')!;
  const depth = panel.querySelector('.depth-card');
  const participants = panel.querySelector('.participant-card');
  let market: { marketId: number; tokenSymbol: string; quoteTokenSymbol: string; quoteDecimals: number; liquidityRaw: string; lockedNotionalRaw: string; longNotionalRaw: string; shortNotionalRaw: string; maxLeverage: number; enabled: boolean } | null = null;
  const context = vm.createContext({ ...renderLocale(),
    $: (selector: string) => document.querySelector(selector),
    selectedPerpMarket: () => market,
    state: { account: '', perpPosition: null, selectedPerpMarketId: 0 },
    config: {},
    selectedNetwork: () => ({ shortName: 'BSC' }),
    formatUnits: (value: bigint) => String(value),
    short: (value: string) => value,
    escapeHtml: (value: unknown) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
  });
  const render = vm.runInContext(`() => {${source.slice(start, end)}}`, context);
  render();
  market = { marketId: 0, tokenSymbol: 'REAL', quoteTokenSymbol: 'tBTUSD', quoteDecimals: 18, liquidityRaw: '100', lockedNotionalRaw: '30', longNotionalRaw: '20', shortNotionalRaw: '10', maxLeverage: 10, enabled: true };
  render();
  assert.equal(panel.querySelector('.depth-card'), depth);
  assert.equal(panel.querySelector('.participant-card'), participants);
  assert.equal(panel.querySelectorAll('.participant-row').length, 1);
  assert.ok(panel.querySelector('[data-perp-shortcut="deposit_liquidity"]'));
  assert.ok(panel.querySelector('[data-perp-shortcut="withdraw_liquidity"]'));
  assert.doesNotMatch(panel.textContent || '', /CASHCAT|500,000|1.84M|12,842|128 LP|92 \/ 100|100×/);
  assert.match(panel.textContent || '', /REAL\/tBTUSD/);
});

test('pool selection never substitutes market zero for a stale or blank selection', () => {
  const source = fs.readFileSync(path.resolve('src/client/launchpad-live.js'), 'utf8');
  assert.match(source, /if \(state\.selectedPerpMarketId != null\)[\s\S]*?return selected \|\| null;/);
  assert.match(source, /const marketIdValue = String\(boundTarget\?\.marketId \?\? \$\("#perps-pool-market"\)\?\.value \?\? ""\)\.trim\(\);/);
  assert.match(source, /if \(!marketIdValue\) throw new Error\("请选择有效的永续市场"\);/);
  assert.doesNotMatch(source, /Number\(\$\("#perps-pool-market"\)\?\.value\);/);
});

test('perpetual creation refresh keeps delivered shells, inputs, and user drafts mounted', () => {
  const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
  const { document } = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  const add = document.querySelector('[data-panel="perps-add-contract"]')!;
  const pool = document.querySelector('[data-panel="perps-create-pool"]')!;
  const shell = add.querySelector('.contract-shell');
  const grid = pool.querySelector('.pool-builder-grid');
  const input = add.querySelector('#perps-contract-address')!;
  const start = source.indexOf('  const initializePerpetualForms =');
  const renderStart = source.indexOf('  const renderPerpetualServices =', start);
  const end = source.indexOf('    const market = state.selectedPerpMarketId == null ? null : selectedPerpMarket();', renderStart);
  const state = {
    account: '0x1234', selectedPerpMarketId: 0, perpPoolTarget: null as null | { marketId:number; tokenAddress:string },
    perpConfig: { enabled:true, permissionlessMarketCreation:true, maxLeverage:10 }, perpServiceBusy:false, perpServiceRequests:[],
    perpMarkets:[
      { marketId:0, tokenAddress:'0x0000000000000000000000000000000000000001', tokenSymbol:'OLD', enabled:true, maxLeverage:10 },
      { marketId:1, tokenAddress:'0x0000000000000000000000000000000000000002', tokenSymbol:'NEW', enabled:false, maxLeverage:10 },
    ],
  };
  const context = vm.createContext({ ...renderLocale(), document, state, ui20260911:true, $:(selector: string) => document.querySelector(selector), isBscFeatureChain:()=>true, escapeHtml:(v: unknown)=>String(v), short:(v: string)=>v, serviceFeeLabel:()=> '0 BNB' });
  const render = vm.runInContext(source.slice(start,end) + '\n};\nrenderPerpetualServices', context);
  render();
  const amount = pool.querySelector('#perps-pool-amount')!;
  const inputControl = input as unknown as { value: string };
  const amountControl = amount as unknown as { value: string };
  inputControl.value = '0x1111111111111111111111111111111111111111';
  amountControl.value = '12.34';
  state.perpServiceBusy = true;
  render();
  assert.equal(add.querySelector('.contract-shell'), shell);
  assert.equal(pool.querySelector('.pool-builder-grid'), grid);
  assert.equal(add.querySelector('#perps-contract-address'), input);
  assert.equal(pool.querySelector('#perps-pool-amount'), amount);
  assert.equal(amountControl.value, '12.34');
  assert.equal(inputControl.value, '0x1111111111111111111111111111111111111111');
  assert.ok(add.querySelector('[data-perp-service-submit="add_contract"]')!.hasAttribute('disabled'));
  assert.ok(pool.querySelector('[data-perp-service-submit="create_pool"]')!.hasAttribute('disabled'));
  assert.doesNotMatch(add.textContent || '', /CASHCAT|\$483K|25,000|已验证/);
  assert.doesNotMatch(pool.querySelector('.pool-summary-card')!.textContent || '', /CASHCAT|50,000|10,000|0\.006 BNB/);

  // The market list and mounted options are unchanged. A creation-flow binding
  // must still move the form from old market #0 to the exact new token/market.
  assert.equal((pool.querySelector('#perps-pool-market') as unknown as { value: string }).value, '0');
  state.perpPoolTarget = { marketId:1, tokenAddress:'0x0000000000000000000000000000000000000002' };
  render();
  assert.equal((pool.querySelector('#perps-pool-market') as unknown as { value: string }).value, '1');
});

test('live history refresh preserves delivered shell and removes sample records', () => {
  const source = fs.readFileSync(path.resolve('src/client/launchpad-live.js'), 'utf8');
  const start = source.indexOf('    const activityPanel = $(\'[data-panel="perps-onchain"]\');', source.indexOf('const renderPerpetualServices'));
  const end = source.indexOf('\n  };\n  const loadPerpetualServiceData', start);
  assert.ok(start > 0 && end > start);
  const { document } = parseHTML(fs.readFileSync(referencePath, 'utf8'));
  const panel = document.querySelector('[data-panel="perps-onchain"]')!;
  const appbar = panel.querySelector('.appbar');
  const toolbar = panel.querySelector('.ledger-toolbar');
  const overview = panel.querySelector('.record-overview');
  const hash = `0x${'a'.repeat(64)}`;
  const state = { perpActivity: [{ marketId: 0, eventType: 'open', lastTxHash: hash, blockNumber: 12, traderAddress: '0x1234' }], perpMarkets: [], perpActivityFilter: 'all', account: '0x1234', perpHistoryBusy: false, perpReadErrors: {}, perpHistoryCursor: null };
  const context = vm.createContext({ ...renderLocale(),
    state,
    $: (selector: string) => document.querySelector(selector),
    filteredPerpetualActivity: () => state.perpActivity,
    short: (value: string) => value,
    escapeHtml: (value: unknown) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    isBscFeatureChain: () => true,
    NETWORKS: { bsc: { explorer: 'https://bscscan.com' } },
  });
  const render = vm.runInContext(`() => {${source.slice(start, end)}}`, context);
  render();
  render();
  assert.equal(panel.querySelector('.appbar'), appbar);
  assert.equal(panel.querySelector('.ledger-toolbar'), toolbar);
  assert.equal(panel.querySelector('.record-overview'), overview);
  assert.equal(panel.querySelectorAll('.record-overview > div').length, 4);
  assert.equal(panel.querySelectorAll('.onchain-row').length, 1);
  assert.equal(panel.querySelector('.onchain-row')!.children.length, 6);
  assert.equal(panel.querySelector('.record-open')!.getAttribute('href'), `https://bscscan.com/tx/${hash}`);
  assert.doesNotMatch(panel.textContent || '', /CASHCAT|MOONBUN|12,842|4.28M|记录已刷新|CSV 导出已准备/);
  assert.equal(panel.querySelector('[data-record-filter="long"]')!.hasAttribute('disabled'), true);
  state.account = '';
  state.perpActivity = [];
  render();
  assert.equal(panel.querySelectorAll('.onchain-row').length, 0);
  assert.match(panel.textContent || '', /请连接钱包/);
});

test('UI comparison permits data text changes but detects class/layout changes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bitbt-ui-drift-'));
  const file = path.join(directory, 'candidate.html');
  try {
    const original = fs.readFileSync(referencePath, 'utf8');
    fs.writeFileSync(file, original.replaceAll('CASHCAT-PERP', 'REAL-TOKEN-PERP'));
    assert.ok(compareUi(file).panels.every(panel => panel.identicalLayout));
    fs.writeFileSync(file, original.replace('class="appbar profile-appbar"', 'class="appbar old-profile"'));
    assert.equal(compareUi(file).panels.find(panel => panel.name === 'profile')?.identicalLayout, false);
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
