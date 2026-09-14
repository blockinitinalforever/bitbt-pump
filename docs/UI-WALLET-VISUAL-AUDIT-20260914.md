# Sep14 UI：逐页连接态核对

## 范围与边界

基于 2026-09-14 原始 UI，保留原始三个 CSS 块和移动端五个底部 TAB。测试使用本机独立 Chrome profile、模拟 SIWE 会话和只读钱包；禁止签名、发交易及生产 API 请求。没有部署，没有消耗 Gas。测试 fixture 位于 tests/，不放入 public/。

## 本轮发现与修复

1. 已连接但未选择代币时，现货按钮错误提示连接钱包。现在明确提示选择代币，并禁用无目标交易。
2. SIWE 过期后仅清空地址，部分交易按钮仍保留可交易外观。现在同步刷新现货、永续按钮并禁用。
3. 永续搜索框初始化禁用后未恢复。现在有市场时启用，无市场或功能未开放时显示明确状态。
4. 永续页头残留原型 100 倍、USDT、每 8 小时结算和示例头像。现在绑定实际市场杠杆、结算资产、网络和图标，不承诺原型结算周期。
5. 公共配置加载与 SIWE 恢复并发时，配置响应可能被会话 epoch 校验丢弃。仅公共 config 改为请求版本与链绑定；个人仓位、余额、历史仍检查账户、Provider 和会话，另有回归证明切链与旧请求仍被丢弃。

## 验证结果

- 原有全量 149 项测试通过；新增公共配置/私有状态隔离回归另行通过（ui-reference 共 11 项）。
- TypeScript 检查及 git diff --check 通过。
- 空市场与有市场只读 fixture 均覆盖 28 个页面 × 1440/390/350px。
- 最后一次有市场复验：84 场景通过，检查当前页面、地址恢复、横向溢出、五 TAB 的尺寸/位置/遮挡、钱包图标及四个底部联系方式。
- 连续八次同文档切页保留会话；模拟 focus 后 401，地址与会话清空，发币/现货/两种永续提交按钮均禁用。
- 最后一次截图与逐页报告：`/var/folders/7k/ygq848zd61l1jbt8hyyl0py00000gn/T/bitbt-ui-layout-4GXMKm`。
- 视觉抽查包含个人中心、现货、永续、发币确认、创建对手池；自动几何检查不是所有像素逐一人工验收。

复验命令：

```sh
npm test
node --experimental-strip-types --test tests/ui-reference.test.ts
node scripts/check-ui-layout.mjs --connected
node scripts/check-ui-layout.mjs --connected --populated
npx tsc --noEmit --incremental false
git diff --check
```

## 正式混淆链路

`npm run build` 在 Next 构建后执行 `protect:client`。递归扫描 public/launchpad 自有 `.js`，执行控制流打乱与字符串混淆，不生成 Source Map；WalletConnect 使用较轻的策略，assets/vendor 第三方代码不采用相同深度混淆。生产部署复制 protected-public 产物覆盖原始脚本，并验证产物及 Source Map。

本轮未移除该机制，已实际执行混淆命令。新增自有浏览器脚本须进入该目录或打包进入已有入口；不能将脚本随意放到未覆盖目录后声称自动受保护。HTML/CSS、网络请求本身不是秘密，混淆不代替后端保管私钥。

## 尚未声称完成的验收

- 未进行 OKX/TP/币安真实手机钱包签名、真实交易或主网验收。
- 逐页自动几何通过不等于与原稿全像素一致，仍需带实际数据的人工对照。
- 模拟会话恢复不等于完整钱包首次连接/签名流程验收。
- 全站英文文案、原型中未被当前协议支持的功能，不应伪装为已实现。
