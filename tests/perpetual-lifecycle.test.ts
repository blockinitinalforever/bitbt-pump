import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
const addressGuard = source.slice(source.indexOf('  const isNonZeroPerpTokenAddress ='), source.indexOf('  const selectedPerpMarket ='));
const pendingGuard = source.slice(source.indexOf('  const ensureNoPendingPerpetualTransaction ='), source.indexOf('  const preparePerpetualWhenReady ='));
const runner = source.slice(source.indexOf('  const executePreparedPerpetual ='), source.indexOf('  const executePerpetualAction ='));
const wallet = '0x' + '11'.repeat(20);
const token = '0x' + '55'.repeat(20);
const approval = { data: '0x095ea7b3', label: 'approval' };
const operation = { data: '0xd7449e6b', label: 'open' };
function fixture() {
  const stored = new Map<string,string>();
  const sent: string[] = [];
  let refreshed = 0;
  const request = { wallet_address: wallet, market_id: 0, action: 'open_position', amount_raw: '10' };
  const context: any = {
    state: { account: wallet, selectedChain: 'bsc', perpConfig: { contractAddress: 'proxy' } },
    readLocalPreference: (k: string) => stored.get(k) || '',
    writeLocalPreference: (k: string,v: string) => stored.set(k,v),
    receiptSucceeded: (r: any) => r.status === '0x1',
    selectedProvider: () => ({ request: async () => null }),
    validatePreparedPerpetual: (_p: any,_m: any,r: any) => {
      assert.equal(r.wallet_address, context.state.account);
      assert.equal(context.state.selectedChain,'bsc');
    },
    api: async (_url: string, options: any) => {
      assert.deepEqual(JSON.parse(options.body),request);
      refreshed++;
      return { transactions: [operation], fresh: true };
    },
    preparePerpetualWhenReady: async (body: any) => context.api('v1/pump/perpetual/prepare', { body: JSON.stringify(body) }),
    sendVaultTransaction: async (tx: any,_label: string,callback: any) => {
      sent.push(tx.label); callback?.('0xhash'); return '0xhash';
    },
  };
  vm.createContext(context);
  vm.runInContext(pendingGuard + runner + '\nglobalThis.run = executePreparedPerpetual;', context);
  return { context, request, stored, sent, refreshed: () => refreshed };
}

test('VM: approval -> reprepare original request -> one core transaction', async () => {
  const f = fixture();
  await f.context.run({transactions:[approval,operation]}, {}, f.request);
  assert.deepEqual(f.sent,['approval','open']);
  assert.equal(f.refreshed(),1);
  assert.equal([...f.stored.values()].filter(Boolean).length,0);
});
test('VM: wallet switch after approval prevents core send', async () => {
  const f = fixture();
  f.context.sendVaultTransaction = async () => { f.context.state.account = 'different'; return '0xhash'; };
  await assert.rejects(f.context.run({transactions:[approval,operation]}, {}, f.request));
});
test('VM: approval rejection never reaches reprepare or open', async () => {
  const f = fixture();
  f.context.sendVaultTransaction = async () => { throw Error('4001 user rejected'); };
  await assert.rejects(f.context.run({transactions:[approval,operation]}, {}, f.request),/4001/);
  assert.equal(f.refreshed(),0);
});
test('VM: broadcast then receipt timeout retains hash and blocks duplicate send', async () => {
  const f = fixture();
  let sends = 0;
  f.context.sendVaultTransaction = async (_tx: any,_label: string,cb: any) => { sends++; cb('0xhash'); throw Error('receipt timeout'); };
  await assert.rejects(f.context.run({transactions:[operation]}, {}, f.request),/timeout/);
  await assert.rejects(f.context.run({transactions:[operation]}, {}, f.request),/禁止重复发送/);
  assert.equal(sends,1);
  f.context.selectedProvider = () => ({request:async()=>({status:'0x1'})});
  await assert.rejects(f.context.run({transactions:[operation]}, {}, f.request),/已成功/);
  assert.equal(sends,1);
});
test('VM: warming keeper polls read-only config then sends at most one more prepare POST', async () => {
  const code = pendingGuard + source.slice(source.indexOf('  const preparePerpetualWhenReady ='), source.indexOf('  const preparePerpetualAction ='));
  const stored = new Map<string,string>();
  let posts = 0;
  let polls = 0;
  const context: any = {
    state: {perpConfig:{contractAddress:'proxy'}},
    readLocalPreference:(key:string)=>stored.get(key)||'',
    writeLocalPreference:(key:string,value:string)=>stored.set(key,value),
    selectedProvider:()=>({request:async()=>null}),
    receiptSucceeded:()=>false,
    renderPerpetual:()=>{},
    window:{setTimeout:(callback:()=>void)=>callback()},
    api:async(url:string)=>{
      if(url.endsWith('/config')) { polls++; return {contractAddress:'proxy',operationsReady:polls>=3,openingsPaused:false}; }
      posts++;
      if(posts===1)throw Error('perpetual keeper is warming up; retry shortly');
      return {transactions:[]};
    },
  };
  vm.createContext(context);
  vm.runInContext(code+'\nglobalThis.prepare = preparePerpetualWhenReady;',context);
  await context.prepare({wallet_address:wallet});
  assert.equal(posts,2);
  assert.equal(polls,3);
  stored.set('bitbt_perp_pending:bsc:proxy:'+wallet,'0x'+'ab'.repeat(32));
  await assert.rejects(context.prepare({wallet_address:wallet}),/禁止重复发送/);
  assert.equal(posts,2);
});
test('VM: keeper keeps polling read-only status for up to three minutes', async () => {
  const code = pendingGuard + source.slice(source.indexOf('  const preparePerpetualWhenReady ='), source.indexOf('  const preparePerpetualAction ='));
  let posts = 0;
  let polls = 0;
  const context: any = {
    state:{perpConfig:{contractAddress:'proxy'}},readLocalPreference:()=>'',writeLocalPreference:()=>{},
    renderPerpetual:()=>{},window:{setTimeout:(callback:()=>void)=>callback()},
    api:async(url:string)=>{if(url.endsWith('/config')){polls++;return {contractAddress:'proxy',operationsReady:false};}posts++;throw Error('perpetual keeper is warming up; retry shortly');},
  };
  vm.createContext(context);
  vm.runInContext(code+'\nglobalThis.prepare = preparePerpetualWhenReady;',context);
  await assert.rejects(context.prepare({wallet_address:wallet}),/未就绪/);
  assert.equal(posts,1);
  assert.equal(polls,36);
});
test('VM: ready config keeps waiting when prepare briefly still reports warming', async () => {
  const code = pendingGuard + source.slice(source.indexOf('  const preparePerpetualWhenReady ='), source.indexOf('  const preparePerpetualAction ='));
  let posts = 0;
  let polls = 0;
  const context: any = {
    state:{perpConfig:{contractAddress:'proxy'}},readLocalPreference:()=>'',writeLocalPreference:()=>{},
    renderPerpetual:()=>{},window:{setTimeout:(callback:()=>void)=>callback()},
    api:async(url:string)=>{
      if(url.endsWith('/config')){polls++;return {contractAddress:'proxy',operationsReady:true,openingsPaused:false};}
      posts++;
      if(posts < 4) throw Error('perpetual keeper is warming up; retry shortly');
      return {transactions:[]};
    },
  };
  vm.createContext(context);
  vm.runInContext(code+'\nglobalThis.prepare = preparePerpetualWhenReady;',context);
  await context.prepare({wallet_address:wallet,action:'open_position'});
  assert.equal(posts,4);
  assert.equal(polls,3);
});
test('VM: degraded keeper stops status polling after one check', async () => {
  const code = pendingGuard + source.slice(source.indexOf('  const preparePerpetualWhenReady ='), source.indexOf('  const preparePerpetualAction ='));
  let posts = 0;
  let polls = 0;
  const context: any = {
    state:{perpConfig:{contractAddress:'proxy'}},readLocalPreference:()=>'',writeLocalPreference:()=>{},
    renderPerpetual:()=>{},window:{setTimeout:(callback:()=>void)=>callback()},
    api:async(url:string)=>{if(url.endsWith('/config')){polls++;return {contractAddress:'proxy',operationsState:'degraded',operationsReady:false};}posts++;throw Error('perpetual keeper is warming up; retry shortly');},
  };
  vm.createContext(context);
  vm.runInContext(code+'\nglobalThis.prepare = preparePerpetualWhenReady;',context);
  await assert.rejects(context.prepare({wallet_address:wallet}),/已停止自动重试/);
  assert.equal(posts,1);
  assert.equal(polls,1);
});
test('VM: perpetual stale-allowance loop is bounded and never sends core', async () => {
  const f = fixture();
  f.context.api = async () => ({transactions:[approval,operation]});
  await assert.rejects(f.context.run({transactions:[approval,operation]}, {}, f.request),/尚未发送/);
  assert.deepEqual(f.sent,['approval','approval','approval']);
});

test('VM: real calldata validator rejects expired quote, wallet switch and mismatched expiry', () => {
  const validation = source.slice(source.indexOf('  const perpetualWord ='),source.indexOf('  const preparePerpetualAction ='));
  const contract = '0x'+'22'.repeat(20), quote = '0x'+'33'.repeat(20);
  const now = Math.floor(Date.now()/1000), deadline = now+30;
  const words = [0n,10n,2n,1n,99n,101n,BigInt(deadline)];
  const prepared = { action:'open_position',marketId:0,expiresAt:deadline,transactions:[{
    to:contract,chainId:'0x38',value:'0x0',data:'0xd7449e6b'+words.map(x=>x.toString(16).padStart(64,'0')).join(''),
  }]};
  const request = {action:'open_position',market_id:0,wallet_address:wallet,amount_raw:'10',leverage:2,is_long:true};
  const market = {quoteTokenAddress:quote,openFeePpm:500};
  const ctx: any = {state:{account:wallet,selectedChain:'bsc',perpConfig:{contractAddress:contract}},normalizeChainId:(x:string)=>x};
  vm.createContext(ctx);
  vm.runInContext(validation+'\nglobalThis.validate = validatePreparedPerpetual;',ctx);
  ctx.validate(prepared,market,request);
  assert.throws(()=>ctx.validate(prepared,market,{...request,price_limit_e18:'100'}),/可接受成交价/);
  assert.throws(()=>ctx.validate({...prepared,expiresAt:now-1},market,request),/过期/);
  ctx.state.account='0x'+'44'.repeat(20);
  assert.throws(()=>ctx.validate(prepared,market,request),/钱包或网络/);
});

test('VM: interrupted send without hash is not blindly retried', async () => {
  const f = fixture();
  let sends = 0;
  f.context.sendVaultTransaction = async (_tx: any,_label: string,_cb: any,start: any) => { sends++; start(); throw Error('transport disconnected'); };
  await assert.rejects(f.context.run({transactions:[operation]}, {}, f.request),/disconnected/);
  await assert.rejects(f.context.run({transactions:[operation]}, {}, f.request),/状态未知/);
  assert.equal(sends,1);
});
test('VM: explicit wallet rejection clears submission marker', async () => {
  const f = fixture();
  f.context.sendVaultTransaction = async (_tx: any,_label: string,_cb: any,start: any) => { start(); throw Object.assign(Error('rejected'),{code:4001}); };
  await assert.rejects(f.context.run({transactions:[operation]}, {}, f.request),/rejected/);
  assert.equal([...f.stored.values()].filter(Boolean).length,0);
});

test('VM: LP completion API failure retries bookkeeping without another deposit', async () => {
  const code = source.slice(source.indexOf('  const completePaidPoolRequest ='),source.indexOf('  const createPermissionlessPerpetualMarket ='));
  const stored = new Map<string,string>();
  let deposits = 0, prepares = 0, completions = 0;
  const hash = '0x'+'aa'.repeat(32), contract = '0x'+'22'.repeat(20);
  const word = (n: bigint) => n.toString(16).padStart(64,'0');
  const provider = {request:async ({method}:any) => {
    if(method==='eth_chainId')return '0x38';
    if(method==='eth_accounts')return [wallet];
    if(method==='eth_getTransactionReceipt')return {status:'0x1',transactionHash:hash,from:wallet,to:contract};
    if(method==='eth_getTransactionByHash')return {hash,from:wallet,to:contract,input:'0x34a860e4'+word(0n)+word(10n),value:'0x0'};
    throw Error(method);
  }};
  const ctx: any = {
    state:{account:wallet,selectedChain:'bsc',perpConfig:{contractAddress:contract},perpMarkets:[{marketId:0,tokenAddress:token}],perpServiceRequests:[],perpPoolTarget:{marketId:0,tokenAddress:token}},
    walletSessionEpoch:0,selectedProvider:()=>provider,normalizeChainId:(x:string)=>x,word,
    receiptHasStatus:(r:any)=>r?.status!=null,receiptSucceeded:(r:any)=>r.status==='0x1',
    readLocalPreference:(k:string)=>stored.get(k)||'',writeLocalPreference:(k:string,v:string)=>stored.set(k,v),
    validatePreparedPerpetual:()=>{},toast:()=>{},show:()=>{},loadPerpetual:async()=>{},
    executePreparedPerpetual:async (_a:any,_m:any,_r:any,cb:any)=>{deposits++;cb(hash);return hash;},
    preparePerpetualWhenReady:async (body:any)=>{prepares++;return {transactions:[],body};},
    api:async (url:string,options:any)=>{
      completions++;
      assert.equal(JSON.parse(options.body).txHash,hash);
      if(completions===1)throw Error('temporary completion failure');
      return {requestId:'request1',status:'completed'};
    },
  };
  vm.createContext(ctx);vm.runInContext(addressGuard+code+'\nglobalThis.complete=completePaidPoolRequest;',ctx);
  const request={requestId:'request1',status:'paid',payload:{marketId:0,tokenAddress:token,amountRaw:'10'}};
  await assert.rejects(ctx.complete(request),/temporary/);
  await ctx.complete(request);
  assert.equal(deposits,1);assert.equal(prepares,1);assert.equal(completions,2);
  assert.equal(ctx.state.perpPoolTarget,null);
});
