import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
const part = (start: string,end: string) => source.slice(source.indexOf(`  const ${start}`),source.indexOf(`  const ${end}`));
function fixture(name: string,end: string) {
  const errors: Record<string,string> = {};
  const provider = {};
  const ctx: any = {
    state:{account:'0x'+'11'.repeat(20),selectedChain:'bsc',selectedPerpMarketId:0,perpConfig:{enabled:true},perpPosition:null,
      perpActivity:[],perpServiceRequests:[],perpIndexedPositions:[],perpHistoryCursor:null,perpReadErrors:errors},
    userDataRequestSequence:0,selectedProvider:()=>provider,
    selectedPerpMarket:()=>({marketId:ctx.state.selectedPerpMarketId}),
    isBscFeatureChain:()=>ctx.state.selectedChain==='bsc',
    renderPerpetual:()=>{},renderPerpetualServices:()=>{},renderWalletState:()=>{},
    setPerpReadError:(key:string,message='')=>{errors[key]=message;},
    api:async()=>[],
  };
  vm.createContext(ctx);
  vm.runInContext(part('perpReadVersions','setPerpReadError')+part(name,end)+`\nglobalThis.run=${name};`,ctx);
  return ctx;
}
for (const scenario of ['wallet','network','market','session'] as const) {
  test(`late position response discarded after ${scenario} changes`, async()=>{
    const c=fixture('loadPerpetualPosition','loadPerpetualWalletBalance');
    let resolve: any; c.api=()=>new Promise(r=>resolve=r);
    const p=c.run();
    if(scenario==='wallet')c.state.account='walletB';
    if(scenario==='network')c.state.selectedChain='robinhood';
    if(scenario==='market')c.state.selectedPerpMarketId=1;
    if(scenario==='session')c.userDataRequestSequence++;
    resolve({wallet:'old'});await p;assert.equal(c.state.perpPosition,null);
  });
}
test('newer same-wallet position response cannot be overwritten',async()=>{
  const c=fixture('loadPerpetualPosition','loadPerpetualWalletBalance');
  const pending:any[]=[];c.api=()=>new Promise(r=>pending.push(r));
  const a=c.run(),b=c.run();pending[1]({version:2});await b;pending[0]({version:1});await a;
  assert.equal(c.state.perpPosition.version,2);
});
test('position failure clears obsolete data and exposes a persistent error',async()=>{
  const c=fixture('loadPerpetualPosition','loadPerpetualWalletBalance');c.state.perpPosition={old:true};
  c.api=async()=>{throw Error('503');};await assert.rejects(c.run(),/503/);
  assert.equal(c.state.perpPosition,null);assert.match(c.state.perpReadErrors.position,/失败/);
});
test('service responses cannot cross wallet/network boundaries',async()=>{
  const c=fixture('loadPerpetualServiceData','loadPerpetualActivity');
  const pending:any[]=[];c.api=()=>new Promise(r=>pending.push(r));
  const p=c.run();c.state.account='walletB';c.state.selectedChain='robinhood';
  pending.forEach(r=>r([{wallet:'old'}]));await p;assert.equal(c.state.perpServiceRequests.length,0);assert.equal(c.state.perpIndexedPositions.length,0);
});
test('service failures are not silently interpreted as refreshed data',async()=>{
  const c=fixture('loadPerpetualServiceData','loadPerpetualActivity');c.state.perpServiceRequests=[{old:true}];
  c.api=async()=>{throw Error('503');};await assert.rejects(c.run(),/读取失败/);
  assert.equal(c.state.perpServiceRequests.length,0);assert.match(c.state.perpReadErrors.services,/读取失败/);
});
test('history is wallet-scoped, paginated by block/log, and deduplicated',async()=>{
  const c=fixture('loadPerpetualActivity','completePaidPoolRequest');const urls:string[]=[];
  const events=Array.from({length:200},(_,i)=>({traderAddress:c.state.account,eventType:i%2?'close':'open',lastTxHash:`tx${i}`,blockNumber:300-i,logIndex:1}));
  c.api=async(url:string)=>{urls.push(url);return url.includes('markets')?[]:url.includes('before_block')?[events.at(-1),{...events[0],lastTxHash:'older',blockNumber:100}]:events;};
  await c.run();assert.equal(c.state.perpActivity.length,200);await c.run(true);
  assert.equal(c.state.perpActivity.length,201);assert.equal(c.state.perpHistoryCursor,null);
  assert.ok(urls.some(u=>u.includes('history=true')&&u.includes(`wallet_address=${c.state.account}`)));
  assert.ok(urls.some(u=>u.includes('before_block=101&before_log_index=1')));
});
test('history never accepts the old position-snapshot response as events',async()=>{
  const c=fixture('loadPerpetualActivity','completePaidPoolRequest');
  c.api=async(url:string)=>url.includes('markets')?[]:[{traderAddress:c.state.account,isOpen:true}];
  await assert.rejects(c.run(),/逐笔交易接口/);assert.equal(c.state.perpActivity.length,0);
  assert.equal(c.state.perpHistoryBusy,false);assert.match(c.state.perpReadErrors.history,/失败/);
});
test('history without a wallet makes no request and clears prior personal rows',async()=>{
  const c=fixture('loadPerpetualActivity','completePaidPoolRequest');c.state.account='';c.state.perpActivity=[{}];
  c.api=async()=>{throw Error('unexpected request');};await c.run();assert.equal(c.state.perpActivity.length,0);
});
test('stale service failure cannot clear another wallet data or raise an old alert',async()=>{
  const c=fixture('loadPerpetualServiceData','loadPerpetualActivity');const rejects:any[]=[];
  c.api=()=>new Promise((_r,j)=>rejects.push(j));const p=c.run();
  c.state.account='walletB';c.state.perpServiceRequests=[{wallet:'walletB'}];
  rejects.forEach(j=>j(Error('old failure')));await p;
  assert.equal(c.state.perpServiceRequests[0].wallet,'walletB');assert.equal(c.state.perpReadErrors.services,undefined);
});
test('history late response cannot populate another wallet',async()=>{
  const c=fixture('loadPerpetualActivity','completePaidPoolRequest');const pending:any[]=[];const wallet=c.state.account;
  c.api=()=>new Promise(r=>pending.push(r));const p=c.run();c.state.account='walletB';
  pending[0]([]);pending[1]([{traderAddress:wallet,eventType:'open',lastTxHash:'hash',blockNumber:1,logIndex:0}]);
  await p;assert.equal(c.state.perpActivity.length,0);
});
test('periodic status response cannot restore BSC config after a network switch',async()=>{
  const c=fixture('refreshPerpetualStatus','perpetualWord');
  c.ui20260911=true;c.perpetualPanelActive=()=>true;c.perpStatusRefreshInFlight=false;c.state.perpMarkets=[{}];
  let resolve:any;c.api=()=>new Promise(r=>resolve=r);const p=c.run();
  c.state.selectedChain='robinhood';c.state.perpConfig=null;resolve({enabled:true});await p;
  assert.equal(c.state.perpConfig,null);assert.equal(c.perpStatusRefreshInFlight,false);
});
