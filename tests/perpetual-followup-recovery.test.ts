import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
const part = (start: string, end: string) => source.slice(source.indexOf(`  const ${start}`), source.indexOf(`  const ${end}`));
const wallet = '0x'+'11'.repeat(20), contract = '0x'+'22'.repeat(20), quote = '0x'+'33'.repeat(20), token = '0x'+'44'.repeat(20);
const hash = '0x'+'aa'.repeat(32), word = (n: bigint) => n.toString(16).padStart(64,'0');
const data = '0x34a860e4'+word(0n)+word(10n);
function deferred() {
  let resolve!: (value: any) => void, reject!: (error: Error) => void;
  const promise = new Promise<any>((r,j) => {resolve=r;reject=j;});
  return {promise,resolve,reject};
}
const tick = () => new Promise<void>(r => setImmediate(r));

test('VM: ordinary user refresh does not discard history or strand pagination', async () => {
  const pending = [deferred(),deferred()];
  const provider = {};
  const c: any = {
    state:{account:wallet,selectedChain:'bsc',perpActivity:[],perpReadErrors:{}},
    walletSessionEpoch:0,userDataRequestSequence:0,selectedProvider:()=>provider,
    isBscFeatureChain:()=>true,renderPerpetualServices(){},renderWalletState(){},setPerpReadError(){},
    api:(url:string)=>pending[url.includes('/markets')?0:1].promise,
  };
  vm.createContext(c);
  vm.runInContext(part('perpReadVersions','setPerpReadError')+part('loadPerpetualActivity','completePaidPoolRequest')+';globalThis.run=loadPerpetualActivity;',c);
  const loading=c.run();c.userDataRequestSequence++;
  const rows=Array.from({length:200},(_,i)=>({eventType:'open',traderAddress:wallet,lastTxHash:hash,logIndex:i,blockNumber:1}));
  pending[0].resolve([]);pending[1].resolve(rows);await loading;
  assert.equal(c.state.perpActivity.length,200);assert.equal(c.state.perpHistoryBusy,false);
  assert.equal(c.state.perpHistoryCursor.logIndex,199);
});

test('VM: obsolete history finally cannot release a newer request, session ABA is rejected',async()=>{
  const pending:any[]=[];const provider={};
  const c:any={state:{account:wallet,selectedChain:'bsc',perpActivity:[],perpReadErrors:{}},walletSessionEpoch:0,
    selectedProvider:()=>provider,isBscFeatureChain:()=>true,renderPerpetualServices(){},renderWalletState(){},setPerpReadError(){},
    api:()=>{const d=deferred();pending.push(d);return d.promise;}};
  vm.createContext(c);vm.runInContext(part('perpReadVersions','setPerpReadError')+part('loadPerpetualActivity','completePaidPoolRequest')+';globalThis.run=loadPerpetualActivity;',c);
  const a=c.run();c.walletSessionEpoch++;const b=c.run();
  pending[0].resolve([]);pending[1].resolve([]);await a;assert.equal(c.state.perpHistoryBusy,true);
  c.walletSessionEpoch++;
  pending[2].resolve([]);pending[3].resolve([{eventType:'open',traderAddress:wallet}]);await b;
  assert.equal(c.state.perpHistoryBusy,false);assert.equal(c.state.perpActivity.length,0);
});

function poolFixture() {
  const stored=new Map<string,string>();
  const completionKey=`bitbt_perp_pool_completion:r:${wallet}`, pendingKey=`bitbt_perp_pending:bsc:${contract}:${wallet}`;
  const calls:string[]=[];
  const receipt:any={status:'0x1',transactionHash:hash,from:wallet,to:contract};
  const tx:any={hash,from:wallet,to:contract,input:data,value:'0x0',chainId:'0x38'};
  const provider={request:async({method}:any):Promise<any>=>{
    calls.push(method);
    if(method==='eth_chainId')return '0x38';
    if(method==='eth_accounts')return [wallet];
    if(method==='eth_getTransactionReceipt')return receipt;
    if(method==='eth_getTransactionByHash')return tx;
    throw Error(method);
  }};
  let sends=0,completions=0;
  const c:any={state:{account:wallet,selectedChain:'bsc',perpConfig:{contractAddress:contract},perpMarkets:[{marketId:0,tokenAddress:token,quoteTokenAddress:quote}],perpServiceRequests:[]},
    walletSessionEpoch:0,selectedProvider:()=>provider,word,normalizeChainId:(x:string)=>x,
    readLocalPreference:(k:string)=>stored.get(k)||'',writeLocalPreference:(k:string,v:string)=>stored.set(k,v),
    toast(){},show(){},loadPerpetual:async()=>{},
    api:async(url:string,options:any)=>{
      calls.push(url);
      if(url.includes('/prepare'))return {action:'deposit_liquidity',marketId:0,transactions:[{to:contract,chainId:'0x38',data,value:'0x0'}]};
      completions++;assert.equal(JSON.parse(options.body).walletAddress,wallet);
      return {requestId:'r',status:'completed'};
    },
    sendVaultTransaction:async(_tx:any,_label:any,cb:any,start:any,check:any)=>{check();start();sends++;cb(hash);throw Error('receipt timeout');},
  };
  vm.createContext(c);
  vm.runInContext(part('receiptHasStatus','waitReceipt')+part('perpetualWord','preparePerpetualAction')
    +part('executePreparedPerpetual','executePerpetualAction')+part('completePaidPoolRequest','createPermissionlessPerpetualMarket')+';globalThis.run=completePaidPoolRequest;',c);
  const request={requestId:'r',walletAddress:wallet,status:'paid',payload:{marketId:0,tokenAddress:token,amountRaw:'10'}};
  return {c,stored,completionKey,pendingKey,calls,receipt,tx,provider,request,sends:()=>sends,completions:()=>completions};
}

test('VM: paid pool recovery requires an explicit valid token address on both request and market',async()=>{
  const missingRequestToken=poolFixture();delete missingRequestToken.request.payload.tokenAddress;
  await assert.rejects(missingRequestToken.c.run(missingRequestToken.request),/代币及市场完全匹配/);
  assert.equal(missingRequestToken.sends(),0);assert.equal(missingRequestToken.completions(),0);
  const missingMarketToken=poolFixture();delete missingMarketToken.c.state.perpMarkets[0].tokenAddress;
  await assert.rejects(missingMarketToken.c.run(missingMarketToken.request),/代币及市场完全匹配/);
  assert.equal(missingMarketToken.sends(),0);assert.equal(missingMarketToken.completions(),0);
});

test('VM: LP broadcast timeout then confirmed revert clears only its hashes and stops this click',async()=>{
  const f=poolFixture();await assert.rejects(f.c.run(f.request),/timeout/);
  assert.equal(f.stored.get(f.completionKey),hash);assert.equal(f.stored.get(f.pendingKey),hash);
  f.receipt.status='0x0';
  await assert.rejects(f.c.run(f.request),/本次未重发/);
  assert.equal(f.stored.get(f.completionKey),'');assert.equal(f.stored.get(f.pendingKey),'');
  assert.equal(f.sends(),1);assert.equal(f.completions(),0);
  // Only a new explicit invocation is allowed to prepare and send again.
  await assert.rejects(f.c.run(f.request),/timeout/);assert.equal(f.sends(),2);
});

for(const scenario of ['pending','unknown','rpc-error','wrong-wallet','wrong-chain','wrong-contract','wrong-calldata','wrong-hash'] as const) {
  test(`VM: LP ${scenario} retains recovery evidence without complete or send`,async()=>{
    const f=poolFixture();f.stored.set(f.completionKey,hash);f.stored.set(f.pendingKey,hash);
    if(scenario==='pending')delete f.receipt.status;
    if(scenario==='unknown')f.receipt.status='0x2';
    if(scenario==='wrong-wallet')f.tx.from=quote;
    if(scenario==='wrong-contract')f.tx.to=quote;
    if(scenario==='wrong-calldata')f.tx.input='0x34a860e4'+word(1n)+word(10n);
    if(scenario==='wrong-hash')f.receipt.transactionHash='0x'+'bb'.repeat(32);
    const original=f.provider.request;
    if(scenario==='wrong-chain')f.provider.request=async(args:any)=>args.method==='eth_chainId'?'0x1':original(args);
    if(scenario==='rpc-error')f.provider.request=async(args:any)=>{if(args.method==='eth_getTransactionReceipt')throw Error('RPC failed');return original(args);};
    await assert.rejects(f.c.run(f.request));assert.equal(f.sends(),0);assert.equal(f.completions(),0);
    assert.equal(f.stored.get(f.completionKey),hash);assert.equal(f.stored.get(f.pendingKey),hash);
  });
}

test('VM: successful cached LP receipt retries only bookkeeping and preserves another pending transaction',async()=>{
  const f=poolFixture();f.stored.set(f.completionKey,hash);f.stored.set(f.pendingKey,'another');
  const api=f.c.api;let fail=true;
  f.c.api=async(...args:any[])=>{if(fail){fail=false;throw Error('503');}return api(...args);};
  await assert.rejects(f.c.run(f.request),/503/);assert.equal(f.stored.get(f.completionKey),hash);
  await f.c.run(f.request);assert.equal(f.sends(),0);assert.equal(f.completions(),1);
  assert.equal(f.stored.get(f.completionKey),'');assert.equal(f.stored.get(f.pendingKey),'another');
});

test('VM: LP approval session ABA prevents reprepare and core send',async()=>{
  const f=poolFixture();let approvals=0;
  const api=f.c.api;
  f.c.api=async(url:string,options:any)=>{
    const result=await api(url,options);
    if(url.includes('/prepare'))result.transactions.unshift({to:quote,chainId:'0x38',value:'0x0',data:'0x095ea7b3'+contract.slice(2).padStart(64,'0')+word(10n)});
    return result;
  };
  f.c.sendVaultTransaction=async()=>{approvals++;f.c.walletSessionEpoch++;return hash;};
  await assert.rejects(f.c.run(f.request),/钱包或网络/);
  assert.equal(approvals,1);assert.equal(f.calls.filter(p=>p.includes('/prepare')).length,1);
  assert.equal(f.stored.size,0);assert.equal(f.completions(),0);
});

test('VM: actual send waits for fees, then rejects stale context before marker or wallet RPC',async()=>{
  const d=deferred();let epoch=0,markers=0,sends=0;
  const provider={request:async()=>{sends++;return hash;}};
  const c:any={selectedProvider:()=>provider,getFeePolicy:()=>d.promise};
  vm.createContext(c);vm.runInContext(part('send =','receiptHasStatus')+';globalThis.run=send;',c);
  const work=c.run({from:wallet,to:contract,gas:100n,
    assertContext:()=>{if(epoch)throw Error('stale session');},onSubmitting:()=>{markers++;}});
  epoch++;d.resolve({maxPriorityFeePerGas:1n,maxFeePerGas:2n});
  await assert.rejects(work,/stale session/);assert.equal(markers,0);assert.equal(sends,0);
});

for(const stage of ['receipt','complete','prepare'] as const) {
  test(`VM: LP session changes during ${stage} cannot complete or populate new wallet state`,async()=>{
    const f=poolFixture(),d=deferred();
    if(stage!=='prepare')f.stored.set(f.completionKey,hash);
    if(stage==='receipt'){
      const rpc=f.provider.request;f.provider.request=async(args:any)=>args.method==='eth_getTransactionReceipt'?d.promise:rpc(args);
    }else{
      const api=f.c.api;f.c.api=async(url:string,options:any)=>url.includes('/'+stage)?d.promise:api(url,options);
    }
    const work=f.c.run(f.request);await tick();f.c.walletSessionEpoch++;
    f.c.state.perpServiceRequests=[{requestId:'new'}];
    d.resolve(stage==='receipt'?f.receipt:stage==='complete'?{requestId:'r'}:{});
    await assert.rejects(work,/钱包或网络/);assert.equal(f.sends(),0);
    assert.equal(f.c.state.perpServiceRequests[0].requestId,'new');
    if(stage!=='prepare')assert.equal(f.stored.get(f.completionKey),hash);
  });
}

function launchFixture() {
  const stored=new Map<string,string>(),events:string[]=[],provider={};
  const c:any={state:{account:wallet,selectedChain:'bsc',tokens:[],details:{},launchConfirmation:null},
    walletSessionEpoch:0,navigationEpoch:0,selectedProvider:()=>provider,
    NETWORKS:{bsc:{name:'BSC'},robinhood:{name:'Robinhood'}},PENDING_LAUNCH_CONFIRMATION_KEY:'launch',
    sessionStorage:{setItem:(k:string,v:string)=>stored.set(k,v),getItem:(k:string)=>stored.get(k)||null,removeItem:(k:string)=>stored.delete(k)},
    clearLaunchReview(){},$:()=>null,window:{setTimeout:(fn:any)=>fn()},document:{documentElement:{dataset:{}}},
    tokenAddress:(t:any)=>t?.contract_address||'',renderTokens:()=>events.push('render'),toast:()=>events.push('toast'),
    renderLaunchResult:()=>events.push('receipt'),
    setTokenPath:()=>events.push('navigate'),openToken:async()=>{events.push('open');return true;},
    api:async()=>({status:'deployed',contract_address:contract}),
  };
  vm.createContext(c);vm.runInContext(part('waitForLaunchFinality','launchTokenSingleFlight')
    +';globalThis.run=confirmSuccessfulLaunch;globalThis.remember=rememberLaunchConfirmation;globalThis.restore=restoreLaunchConfirmation;',c);
  const pending={prepared:{chain_id:'bsc',launch:{id:'old',creator_address:wallet},predicted_token_address:contract},hash,name:'Old',symbol:'OLD',quote:'BNB'};
  c.remember(pending);events.length=0;
  return {c,stored,events,pending};
}

for(const change of ['chain','wallet','session','provider','navigation','replacement'] as const) {
  for(const failure of [false,true])test(`VM: late launch ${failure?'failure':'success'} after ${change} preserves confirmation without UI writes`,async()=>{
    const f=launchFixture(),d=deferred();f.c.api=()=>d.promise;
    const work=f.c.run();
    if(change==='chain')f.c.state.selectedChain='robinhood';
    if(change==='wallet')f.c.state.account=quote;
    if(change==='session')f.c.walletSessionEpoch++;
    if(change==='provider')f.c.selectedProvider=()=>({});
    if(change==='navigation')f.c.navigationEpoch++;
    if(change==='replacement')f.c.remember({...f.pending,hash:'0x'+'bb'.repeat(32)});
    f.events.length=0;const saved=f.stored.get('launch');
    if(failure)d.reject(Error('503'));else d.resolve({status:'deployed',contract_address:contract});
    await work;assert.equal(f.c.state.tokens.length,0);assert.equal(Object.keys(f.c.state.details).length,0);
    assert.deepEqual(f.events,[]);assert.equal(f.stored.get('launch'),saved);
  });
}

test('VM: launch retained across reload refuses wrong chain/wallet, then recovers on original binding',async()=>{
  const f=launchFixture();f.c.state.launchConfirmation=null;f.c.restore();
  const paths:string[]=[];f.c.api=async(path:string)=>{paths.push(path);return {status:'deployed',contract_address:contract};};
  f.c.state.selectedChain='robinhood';await assert.rejects(f.c.run(),/切回/);
  f.c.state.selectedChain='bsc';f.c.state.account=quote;await assert.rejects(f.c.run(),/原创建者/);
  assert.equal(paths.length,0);f.c.state.account=wallet;await f.c.run();
  assert.equal(paths[0],'v1/token/launch?chain_id=bsc');assert.equal(f.c.state.tokens[0].symbol,'OLD');
  assert.equal(f.stored.has('launch'),false);assert.equal(f.events.filter(x=>x==='navigate').length,1);
});

test('VM: launch polling stops after navigation and never uses the new chain',async()=>{
  const f=launchFixture(),d=deferred(),paths:string[]=[];
  f.c.api=async(path:string)=>{paths.push(path);return path.includes('/status')?d.promise:{status:'deploying'};};
  const work=f.c.run();await tick();f.c.state.selectedChain='robinhood';f.c.navigationEpoch++;
  d.resolve({status:'deploying'});await work;
  assert.equal(paths.length,2);assert.ok(paths.every(p=>p.includes('chain_id=bsc')));
  assert.equal(f.c.state.tokens.length,0);assert.equal(f.stored.has('launch'),true);
});

test('VM: late logo upload preserves URL for original launch without calling confirmation on new chain',async()=>{
  const f=launchFixture(),d=deferred();f.c.state.launchConfirmation.logoRequired=true;
  f.c.window.bitbtLaunchLogoSelectionKey=()=> 'logo';f.c.window.bitbtUploadSelectedLaunchLogo=()=>d.promise;
  f.c.api=async()=>{throw Error('must not call');};
  const work=f.c.run();f.c.state.selectedChain='robinhood';d.resolve('https://example.test/logo.png');await work;
  assert.equal(JSON.parse(f.stored.get('launch')!).confirmedLogoUrl,'https://example.test/logo.png');
  assert.deepEqual(f.events,[]);
});

for (const navigateAway of [false,true]) test(`VM: actual launch -> openToken ${navigateAway?'rejects late navigation':'navigates successfully without invalidating its own epoch'}`,async()=>{
  const f=launchFixture(),d=deferred();
  Object.assign(f.c,{detailRequestSequence:0,selectedDetailAddress:'',status:()=>'',fetchCandles:()=>d.promise,
    renderSelected(){},renderTradeConfig(){},renderLiveRows(){},drawCharts(){},refreshBalances:async()=>{},
    activateDetail:()=>f.events.push('activate')});
  vm.runInContext(part('loadDetail','activateDetail')+part('openToken =','openTokenAddress')+';globalThis.openToken=openToken;',f.c);
  const work=f.c.run();await tick();
  if(navigateAway){
    f.c.navigationEpoch++;f.c.state.selectedChain='robinhood';
    f.c.state.tokens=[];f.c.state.details={};f.events.length=0;
  }
  d.resolve([]);await work;
  if(navigateAway){
    assert.deepEqual(f.events,[]);assert.equal(f.c.state.tokens.length,0);assert.equal(Object.keys(f.c.state.details).length,0);
    assert.equal(f.stored.has('launch'),true);
  }else{
    assert.equal(f.c.navigationEpoch,0);assert.equal(f.c.state.tokens[0].symbol,'OLD');
    assert.equal(f.events.filter(x=>x==='activate').length,1);assert.equal(f.events.filter(x=>x==='navigate').length,1);
    assert.equal(f.stored.has('launch'),false);
  }
});
