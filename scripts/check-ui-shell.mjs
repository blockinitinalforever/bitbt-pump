import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The public /pump wrapper has its own sizing and clipping rules. Inspect
// that entrypoint, not just the inner launchpad. Production API traffic is blocked.
const target=await (await fetch('http://127.0.0.1:9237/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let sequence=0;const pending=new Map();
ws.onmessage=event=>{const result=JSON.parse(event.data);const task=pending.get(result.id);if(!task)return;clearTimeout(task.timer);pending.delete(result.id);result.error?task.reject(Error(result.error.message)):task.resolve(result.result);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bitbt-ui-shell-'));const report=[];
try {
  await send('Page.enable');await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['*/api/pump/*','*/ws/market*','*walletconnect*','*reown*']});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__uiPopulated=true;\n'+fs.readFileSync('tests/fixtures/ui-wallet-readonly.js','utf8')});
  for(const width of [1440,1100,800,760,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:600,deviceScaleFactor:1,mobile:width<760});
    await send('Page.navigate',{url:'http://127.0.0.1:3188/pump?screen=profile'});
    let ready=false;
    for(let i=0;i<40;i++) {
      const result=await send('Runtime.evaluate',{expression:"!!document.querySelector('iframe')?.contentDocument?.querySelector('[data-panel=profile].active')",returnByValue:true});
      if(result.result?.value){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!ready)throw Error('Public wrapper did not load profile');
    const result=await send('Runtime.evaluate',{expression:`(() => {
      const frame=document.querySelector('iframe');const rect=frame.getBoundingClientRect();const inner=frame.contentDocument;
      inner.querySelector('[data-operation-error-dismiss]')?.click();
      // Desktop reference scrolls the whole document; mobile keeps the footer
      // visible. In both cases it must be reachable without clipping by the wrapper.
      if(frame.contentWindow.innerWidth>760)inner.querySelector('[data-global-official-contacts]').scrollIntoView({block:'end'});
      const contacts=[...inner.querySelectorAll('[data-global-official-contacts] a')].map(node=>{const r=node.getBoundingClientRect();return {bottom:rect.y+r.bottom,visible:r.width>0&&r.height>0&&rect.y+r.top>=0&&rect.y+r.bottom<=innerHeight+1&&rect.x+r.right<=innerWidth+1,unobstructed:node.contains(inner.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
      return {frame:{top:rect.top,bottom:rect.bottom,height:rect.height},viewport:innerHeight,contacts,overflow:document.documentElement.scrollWidth>innerWidth};
    })()`,returnByValue:true});
    report.push({width,...result.result.value});
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,`pump-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,report},null,2));
  if(report.some(r=>r.overflow||r.frame.bottom>r.viewport||r.contacts.length!==4||r.contacts.some(c=>!c.visible||!c.unobstructed)))process.exitCode=1;
} finally {ws.close();await fetch('http://127.0.0.1:9237/json/close/'+target.id);}
