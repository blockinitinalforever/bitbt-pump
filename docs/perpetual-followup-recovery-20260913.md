# 永续与发币后续恢复修复

基线：fetch 后的 `origin/main` / `380a860`。分支：`fix/perpetual-followup-recovery-20260913`。
仅修改前端仓库。未 commit、push、建 PR、评论、部署或执行链上交易；主 session 统一提交。

## 修复行为

### 独立钱包会话版本

永续读取绑定 `walletSessionEpoch`，不再复用普通 `loadUserPanels` / 收藏刷新递增的 `userDataRequestSequence`。
退出/钱包重置、切产品网络、登录成功及恢复不同身份会推进会话版本；普通资料刷新不会使历史、仓位等请求失效。
历史加载的 finally 仅允许本类型最新请求释放 busy，旧请求不能解除新请求的分页锁；真正会话变化的迟到数据仍被丢弃。

### LP 已广播交易恢复

恢复绑定捕获的账户、Provider、BSC、合约和会话版本。读取回执前后核对 Provider 的 `eth_chainId` / `eth_accounts`；异步 prepare、授权、发送前及 complete 返回后也检查上下文。

缓存哈希恢复时同时读取 receipt 和 transaction，核对哈希、from、to、deposit selector、marketId、amount、value 及可用的交易 chainId：

- 成功回执：仅补 complete，不重复注资；接口失败仍保留原哈希。
- 明确失败状态 `false / 0 / "0" / "0x0" / "0x00"`：清除本申请 completion 和相同哈希的 pending，抛出提示并结束本次点击。后续重新注资必须另一次明确点击。
- 无回执、无 status、未知 status、RPC 失败或绑定不匹配：保留恢复证据，不 complete、不清除、不发送。
- 其他交易的 pending 不随本申请清除。无 completion 而只有 pending 的通用恢复路径也拒绝无 status / 未知 status。

发送前的上下文检查位于 Gas 费读取之后；只有即将调用钱包发送 RPC 时才写入 unknown 标记，避免尚未进入钱包的取消操作留下虚假的广播不明记录。

### 发币成功确认与导航

持久化记录保留 prepared 中的原 `chain_id` 与 `launch.creator_address`，并保存显式 chain/account 字段；旧格式记录从 prepared 恢复绑定。缺少原链或创建者的记录保留并拒绝猜测当前链。
必须切回原产品网络、连接原创建者钱包才能重试。launch / status 请求显式携带原 chain_id。

确认过程绑定记录对象、钱包会话、Provider、网络和导航版本。Logo 上传、后台确认、状态轮询及详情读取迟到时，不导航、不向新链列表/详情写入、不清除待恢复记录；过时错误不修改新流程的按钮。
Logo 已上传的 URL 可继续保存在原待确认记录中，防止重传。记录被新流程替换时，旧流程不会覆盖或删除新记录。

`confirmSuccessfulLaunch` 向 `openToken` 传入 `isCurrent`；该分支不自增 navigationEpoch。正常成功仍打开详情并导航，最后清除确认记录；详情读取中离开页面则保留记录供返回原链后恢复。

## 验证

新增 `tests/perpetual-followup-recovery.test.ts`，从实际前端源码提取函数运行 VM，不重写被测状态机。覆盖普通刷新、会话 ABA、分页并发、LP 超时后回滚、失败状态/绑定/读 RPC、补记账失败重试、授权后身份变化、发送前费用等待，以及发币正常成功导航、切链/钱包/Provider/会话/导航/记录替换后的迟到成功与失败、Logo、轮询、刷新恢复。
正常发币导航和离开页面后的详情迟到测试使用实际 `confirmSuccessfulLaunch`、`openToken`、`loadDetail`，验证导航版本不会自我失效。
既有 production VM 的恢复夹具补上真实 prepare 响应已有的 `chain_id`，保留“刷新后仅确认、不重发、正常导航”的断言。

- `npx tsc --noEmit`：通过。
- `npm run bundle:launchpad`：通过，更新 public bundle。
- `npm test`：139 passed、0 failed、0 skipped；包含 34 项新增 followup VM 回归。首次运行唯一失败为旧 production 恢复夹具缺少 chain_id；补齐真实响应字段后全量复跑通过。
- `git diff --check`：通过。

## 边界

未修改 UI 布局、Keeper、合约、API 或历史索引策略。Keeper 余额和旧历史无回补仍为既有边界。
本地 RPC/API 均为 VM 模拟，无链上测试。恢复记录沿用浏览器存储；清除浏览器数据、缺失哈希或不完整绑定不自动推断或重发。
