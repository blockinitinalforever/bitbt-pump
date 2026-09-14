import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Local, read-only browser inspection. Uses a separate headless Chrome profile.
// Optional simulated session/provider; never signing or production API traffic.
const connected = process.argv.includes('--connected');
const realData = process.argv.includes('--real-data');
const height = process.argv.includes('--short') ? 600 : 900;
const breakpoints = process.argv.includes('--breakpoints');
const screenArgument = process.argv.find(value => value.startsWith('--screens='));
const widthArgument = process.argv.find(value => value.startsWith('--widths='));
const focusArgument = process.argv.find(value => value.startsWith('--focus='));
const focusSelector = focusArgument ? focusArgument.slice('--focus='.length) : '';
const requestedScreens = screenArgument ? new Set(screenArgument.slice('--screens='.length).split(',').filter(Boolean)) : null;
const requestedWidths = widthArgument ? widthArgument.slice('--widths='.length).split(',').map(Number).filter(Number.isFinite) : null;
const criticalPanels = ['discover','detail','trade','perps','create-basic','create-tax','create-review','profile'];
const screens = [...fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8').matchAll(/<section\b[^>]*data-panel="([^"]+)"/g)].map(match => match[1]).filter(name => (!process.argv.includes('--launch-preview') || name === 'create-economics') && (!process.argv.includes('--error-copy') || name === 'perps') && (!requestedScreens || requestedScreens.has(name)));
const target = await (await fetch('http://127.0.0.1:9237/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const pending = new Map();
let sequence = 0;
socket.onmessage = event => {
  const result = JSON.parse(String(event.data));
  const task = pending.get(result.id);
  if (!task) return;
  pending.delete(result.id);
  clearTimeout(task.timer);
  if (result.error) task.reject(Error(result.error.message));
  else task.resolve(result.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000);
  pending.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bitbt-ui-layout-'));
const report = [];
const transitions = [];
try {
  await send('Page.enable');
  await send('Network.enable');
  if (!realData) await send('Network.setBlockedURLs', { urls: ['*/api/pump/*', '*/ws/market*', '*walletconnect*', '*reown*'] });
  if (connected) await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__uiPopulated = ${process.argv.includes('--populated')};localStorage.setItem('bitbt_pump_locale', '${process.argv.includes('--english') ? 'en' : 'zh'}');\n` + fs.readFileSync('tests/fixtures/ui-wallet-readonly.js', 'utf8') });
  for (const width of requestedWidths || (breakpoints ? [1100, 760, 560, 440] : [1440, 390, 350])) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 760 });
    for (const screen of screens) {
      if (breakpoints && !criticalPanels.includes(screen)) continue;
      await send('Page.navigate', { url: `http://127.0.0.1:3188/launchpad/bitbt-launch-ui-app.html?screen=${screen}` });
      let state;
      for (let tries = 0; tries < 40; tries++) {
        const result = await send('Runtime.evaluate', { expression: `document.readyState === "complete" && !document.body.classList.contains("runtime-pending") && (${connected} ? document.querySelector('.connect-global')?.title === window.__uiAudit?.address : true)`, returnByValue: true });
        if (result.result?.value) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // Session restoration finishes before secondary market reads/rendering.
      // Capture the settled UI, not the first paint with a restored address.
      await new Promise(resolve => setTimeout(resolve, 600));
      if (process.argv.includes('--launch-preview')) await send('Runtime.evaluate', { expression: `(() => {
        const name=document.querySelector('#token-name'); name.value='ABCDEFGHIJKLMNOPQRSTUVWX'; name.dispatchEvent(new Event('input',{bubbles:true}));
        const symbol=document.querySelector('#token-symbol'); symbol.value='ABCDEFGHIJ'; symbol.dispatchEvent(new Event('input',{bubbles:true}));
      })()` });
      // Deliberately blocked API requests can show the expected error dialog.
      // Dismiss via its normal button so screenshots inspect the page beneath.
      await send('Runtime.evaluate', { expression: "document.querySelector('[data-operation-error-dismiss]')?.click()" });
      if (focusSelector) {
        await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(focusSelector)})?.scrollIntoView({block:'center',behavior:'instant'})` });
      }
      state = await send('Runtime.evaluate', {
        expression: `(() => {
          const panel = document.querySelector('[data-panel].active');
          const box = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
          const chineseCopy = [];
          if (document.documentElement.lang === 'en' && panel) {
            const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const node = walker.currentNode;
              if (/[\\u3400-\\u9fff]/.test(node.nodeValue) && node.parentElement?.getClientRects().length) chineseCopy.push(node.nodeValue.trim());
            }
          }
          return {
            chineseCopy,
            panel:panel?.dataset.panel,
            pending:document.body.classList.contains('runtime-pending'),
            errorDialog:!document.querySelector('[data-operation-error]')?.hidden,
            viewport:innerWidth,
            overflow:document.documentElement.scrollWidth > innerWidth,
            exposedHidden:[...document.querySelectorAll('#bitbt-launch [hidden]')].filter(node=>node.getClientRects().length > 0).map(node=>node.id || node.getAttributeNames().find(name=>name.startsWith('data-')) || node.tagName),
            previewOverflow:[...panel.querySelectorAll('.token-preview')].some(node=>node.scrollWidth > node.clientWidth + 1),
            wallet:box(document.querySelector('.connect-global')),
            walletIcon:!!document.querySelector('.connect-global .ico'),
            walletTitle:document.querySelector('.connect-global')?.title,
            marketSearch:{disabled:document.querySelector('#perps-market-search')?.disabled,placeholder:document.querySelector('#perps-market-search')?.placeholder},
            audit:window.__uiAudit ? { unknown:window.__uiAudit.unknown, blocked:window.__uiAudit.blocked } : null,
            header:box(document.querySelector('.studio-head')),
            activePanel:box(panel),
            bottomTabs:[...document.querySelectorAll('.bottom-nav > button')].map(node => { const r = node.getBoundingClientRect(); return { name:node.dataset.nav, ...box(node), unobstructed:node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; }),
            bottomVisible:document.querySelector('.bottom-nav')?.classList.contains('visible'),
            contacts:document.querySelectorAll('[data-global-official-contacts] a').length
            ,visibleContactStrips:[...document.querySelectorAll('.profile-support,[data-global-official-contacts]')].filter(node=>node.getClientRects().length).length
            ,runtimeRows:[...panel.querySelectorAll('.live-row,.rank-row')].slice(0,3).map(node=>{const r=node.getBoundingClientRect();const style=getComputedStyle(node);return {width:r.width,panelWidth:panel.clientWidth,background:style.backgroundColor,display:style.display}})
            ,tokenCardChildren:[...panel.querySelector('.token-card')?.children||[]].map(node=>node.className)
            ,tokenCardStyle:(()=>{const node=panel.querySelector('.token-card');if(!node)return null;const style=getComputedStyle(node);const r=node.getBoundingClientRect();return {display:style.display,background:style.backgroundColor,borderRadius:style.borderRadius,padding:style.padding,minHeight:style.minHeight,width:r.width}})()
            ,textControlFonts:[...panel.querySelectorAll('input,textarea,select')].filter(node=>node.type!=='file'&&node.type!=='checkbox'&&node.type!=='radio'&&node.type!=='range').map(node=>getComputedStyle(node).fontSize)
          };
        })()`,
        returnByValue: true,
      });
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `${screen}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      const controls = await send('Runtime.evaluate', { expression: `(() => {
        const panel = document.querySelector('[data-panel].active');
        const button = panel?.querySelector('#trade-submit, #perps-submit, [data-launch-publish], [data-perp-service-submit], :scope > button.primary');
        if (!button) return null;
        button.scrollIntoView({block:'center',behavior:'instant'});
        const r = button.getBoundingClientRect();
        const footer = document.querySelector('.official-contact-footer')?.getBoundingClientRect();
        return {text:button.textContent, disabled:button.disabled, reachable:r.top >= 0 && r.bottom <= Math.min(innerHeight, footer?.top || innerHeight) && (button.disabled || button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))};
      })()`, returnByValue: true });
      report.push({ screen, width, height, ...state.result?.value, primaryControl:controls.result?.value });
      if (breakpoints && screen === 'discover') {
        const menu = await send('Runtime.evaluate',{expression:`(() => {
          document.querySelector('[data-chain-menu-toggle]').click();
          const options=[...document.querySelectorAll('[data-global-chain-option]')].map(node=>{const r=node.getBoundingClientRect();return {chain:node.dataset.globalChainOption,visible:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,unobstructed:node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
          document.querySelector('[data-chain-menu-toggle]').click();return options;
        })()`,returnByValue:true});
        fs.writeFileSync(path.join(output,'network-menu-'+width+'.json'),JSON.stringify(menu.result?.value,null,2));
        if (menu.result?.value?.length!==2 || menu.result.value.some(item=>!item.visible||!item.unobstructed)) process.exitCode=1;
      }
    }
  }
  if (connected) {
    if (process.argv.includes('--error-copy')) {
      await send('Runtime.evaluate',{expression:`(() => {
        document.querySelector('[data-set-language="en"]').click();
        const amount=document.querySelector('#perps-size');amount.value='100';amount.dispatchEvent(new Event('input',{bubbles:true}));
        const leverage=document.querySelector('#perps-leverage');leverage.value='10';leverage.dispatchEvent(new Event('input',{bubbles:true}));
        document.querySelector('#perps-submit').click();
      })()`});
      await new Promise(resolve=>setTimeout(resolve,500));
      const dialog=await send('Runtime.evaluate',{expression:`(() => {
        const overlay=document.querySelector('[data-operation-error]');const dismiss=document.querySelector('[data-operation-error-dismiss]');const r=dismiss.getBoundingClientRect();
        return {visible:!overlay.hidden,title:document.querySelector('[data-operation-dialog-title]').textContent,message:document.querySelector('[data-operation-error-message]').textContent,dismiss:dismiss.textContent,reachable:r.top>=0&&r.bottom<=innerHeight,blocked:window.__uiAudit.blocked};
      })()`,returnByValue:true});
      fs.writeFileSync(path.join(output,'error-copy.json'),JSON.stringify(dialog.result?.value,null,2));
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,'error-copy-350.png'),Buffer.from(shot.data,'base64'));
      const d=dialog.result?.value;
      if (!d?.visible || d.title!=='Check the parameters and retry' || !d.message.includes('100 × 10 = 1000') || !d.message.includes('current limit: 100') || !d.reachable || d.blocked.length) process.exitCode=1;
      await send('Runtime.evaluate',{expression:"document.querySelector('[data-operation-error-dismiss]').click()"});
    }
    const localeCheck = await send('Runtime.evaluate', { expression: `(() => {
      const saved=localStorage.getItem('bitbt_pump_locale');
      const input=document.querySelector('#token-name'); const previous=input.value; input.value='用户名称 UITEST';
      const calls=window.__uiAudit.calls.length;
      document.querySelector('[data-set-language="en"]').click();
      const english={banner:document.querySelector('[data-api-status]').textContent,placeholder:document.querySelector('#perps-market-search').placeholder,badge:document.querySelector('[data-launch-chain].active .tag').textContent};
      document.querySelector('[data-set-language="zh"]').click();
      const chinese={banner:document.querySelector('[data-api-status]').textContent,badge:document.querySelector('[data-launch-chain].active .tag').textContent};
      const result={english,chinese,preserved:input.value==='用户名称 UITEST',newCalls:window.__uiAudit.calls.length-calls};
      input.value=previous;document.querySelector('[data-set-language="'+saved+'"]').click();return result;
    })()`, returnByValue:true });
    fs.writeFileSync(path.join(output,'locale-transitions.json'),JSON.stringify(localeCheck.result?.value,null,2));
    const locale=localeCheck.result?.value;
    if (!locale?.preserved || locale.newCalls !== 0 || locale.english.badge !== 'Selected' || locale.chinese.badge !== '已选择' || (process.argv.includes('--populated') && (!locale.english.banner.includes('projects') || !locale.chinese.banner.includes('个项目')))) process.exitCode=1;
    // Same-document navigation must retain a verified session. No connect/sign click.
    for (const screen of ['profile', 'perps', 'perps-onchain', 'perps-add-contract', 'perps-create-pool', 'create-basic', 'trade', 'profile']) {
      await send('Runtime.evaluate', { expression: `(() => { const button = document.querySelector('[data-open="${screen}"], [data-nav="${screen}"]'); if (!button) throw Error('Missing navigation ${screen}'); button.click(); })()` });
      await new Promise(resolve => setTimeout(resolve, 250));
      const result = await send('Runtime.evaluate', { expression: `({screen:document.querySelector('[data-panel].active')?.dataset.panel, wallet:document.querySelector('.connect-global')?.title, session:!!sessionStorage.getItem('bitbt_pump_session')})`, returnByValue: true });
      transitions.push({ expected: screen, ...result.result?.value });
    }
    // Simulate expiry on focus, then inspect transaction controls and address clearing.
    await send('Runtime.evaluate', { expression: `window.__uiAudit.expired = true; window.dispatchEvent(new Event('focus'));` });
    // Background Chrome tabs throttle timers. Await the observable expiry
    // transition, not a 700ms sleep; still fail closed after the bounded wait.
    for (let attempt=0; attempt<25; attempt++) {
      const cleared=await send('Runtime.evaluate',{expression:"!sessionStorage.getItem('bitbt_pump_session')",returnByValue:true});
      if (cleared.result?.value) break;
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    const expired = await send('Runtime.evaluate', { expression: `({wallet:document.querySelector('.connect-global')?.title || '', session:sessionStorage.getItem('bitbt_pump_session'), buttons:[...document.querySelectorAll('[data-launch-publish], [data-perp-submit], #perps-submit, #trade-submit')].map(node=>({name:node.id || node.getAttributeNames().find(name=>name.startsWith('data-')),disabled:node.disabled,text:node.textContent}))})`, returnByValue: true });
    fs.writeFileSync(path.join(output, 'wallet-transitions.json'), JSON.stringify({ transitions, expired: expired.result?.value }, null, 2));
    if (transitions.some(item => item.screen !== item.expected || item.wallet !== '0x1111111111111111111111111111111111111111' || !item.session)) process.exitCode = 1;
    const expiry = expired.result?.value;
    if (!expiry || expiry.wallet || expiry.session || expiry.buttons.some(button => !button.disabled)) process.exitCode = 1;
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (report.some(item => item.exposedHidden?.length)) process.exitCode = 1;
  if (report.some(item => item.previewOverflow)) process.exitCode = 1;
  console.log(JSON.stringify({ output, report }, null, 2));
  if (report.some(item => item.pending || item.errorDialog || item.panel !== item.screen || item.overflow || !item.walletIcon || item.contacts !== 4 || item.primaryControl?.reachable === false || (connected && item.walletTitle !== '0x1111111111111111111111111111111111111111'))) process.exitCode = 1;
  if (report.some(item => item.tokenCardStyle && (item.tokenCardStyle.display !== 'flex' || item.tokenCardStyle.background !== 'rgb(16, 18, 19)' || item.tokenCardStyle.borderRadius !== '14px' || item.tokenCardStyle.padding !== '15px' || item.tokenCardStyle.minHeight !== '150px'))) process.exitCode = 1;
  if (report.some(item => item.bottomTabs?.map(tab => tab.name).join(',') !== 'discover,live,create-mode,rank,profile' || item.bottomVisible !== ['discover','live','rank','create-mode','profile'].includes(item.screen) || (item.width < 760 && item.bottomVisible && item.bottomTabs.some(tab => !tab.unobstructed || tab.width < 44 || tab.height < 44 || tab.x < 0 || tab.x + tab.width > item.width + 1 || Math.abs(tab.y - item.bottomTabs[0].y) > 1)))) process.exitCode = 1;
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:9237/json/close/${target.id}`);
}
