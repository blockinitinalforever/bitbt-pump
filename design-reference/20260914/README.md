# BitBT Launch 前端 UI 交付说明

本交付包是 BitBT 的 MEME 发射器与永续合约前端原型，包含完整源码、28 个界面、全部本地视觉资源、中英文切换、公告中心、代币 K 线、买入/卖出、当前币种持仓，以及 BSC / Robinhood Chain 双链 MEME 永续市场。

## 1. 快速运行

在线预览（同事可直接打开）：

```text
https://bitbt-wallet-ui.songnao2004.chatgpt.site
```

无需安装 Node.js 的本地预览方式：

```bash
python3 -m http.server 8080 -d public
```

然后打开 `http://localhost:8080/bitbt-wallet-ui.html`。

完整开发环境：

环境要求：Node.js 22.13.0 或更高版本。

```bash
npm install
npm run dev
```

启动后访问：

```text
http://localhost:3000/bitbt-wallet-ui.html
```

不要直接双击 HTML 文件。项目使用沙盒 iframe 与 CSP，必须通过本地 HTTP 服务打开，才能保证字体、图标、K 线插件和页面跳转正常。

## 2. 主要入口

- `public/bitbt-wallet-ui.html`：交付入口，保留沙盒 iframe 与 CSP。
- `public/bitbt-launch-ui-app.html`：发射器的完整交互 UI。
- `public/assets/`：全部离线资源，包含 Logo、图标、字体、链与代币图、K 线插件、预览图和原生 APP 图标。
- `AGENTS.md`：同事的 Codex 开始开发前必须阅读的项目规则、页面契约与完成标准。
- `docs/PAGE-STRUCTURE.md`：28 个页面、七个模块、跳转关系和全局状态的人类可读地图。
- `docs/page-structure.json`：供 Codex 或脚本读取的机器可读页面清单。
- `app/`：Sites/Next 应用外壳。
- `tests/rendered-html.test.mjs`：离线资源、页面数量、CSP 与引用完整性测试。
- `RESOURCE-MANIFEST.sha256`：资源校验清单。
- `THIRD-PARTY-NOTICES.md`：第三方依赖说明。
- `dist/`：已经构建完成的生产部署产物。
- `FILE-MANIFEST.sha256`：交付包内全部文件的 SHA-256 校验清单。

## 3. 页面清单（28 页）

1. 发现市场
2. 实时链上
3. 排行榜
4. 公告中心
5. 代币详情 / K 线
6. 交易工作台
7. 创建方式选择
8. 创建代币：资料
9. 创建代币：发行参数
10. 创建代币：税费与分配
11. 发布确认
12. 发布成功
13. 我的发射
14. 交易记录
15. 自选
16. 我的
17. MEME 永续交易终端
18. 添加链上 MEME 合约（仅 BSC / Robinhood Chain）
19. 创建对手池（散户联合池 / 专业做市池）
20. 对手池详情、双边深度与参与者
21. 双链链上开仓记录
22. 通用操作中心（钱包连接、搜索、设置、订单确认、流动性与导出状态）
23. 收入中心与 Split Vault（总览、自动分账、结算记录）
24. 开发者工具（API、Webhook、SDK 与 Bot）
25. 邀请、活动与 KOL 中心
26. 价格与迁移提醒中心
27. 交易保护（MEV、防夹、滑点与风险阈值）
28. 语言与显示（中英文、计价、时区与动态效果）

## 4. 已完成的关键交互

- 点击不同代币后，详情页和交易页会同步更新代币名称、图片、价格、曲线与持仓数据。
- 交易页采用“行情数据 → K 线 → 买入/卖出或开多/开空 → 持仓与订单”的阅读顺序；移动端与桌面端都会优先展示 K 线，再显示下单区。
- 买入与卖出会切换余额、输入单位、快捷比例、预估获得、交易路径与最低收到。
- 持有人页显示创建者地址标签和持仓比例。
- 公告栏可点击进入公告中心，公告卡片可切换正文。
- 创建代币先选择“快速公平发射 / 自定义联合曲线 / 社区收益代币”，再进入四步创建流程。
- 发行代币可选择 BNB Chain 或 Robinhood Chain，计价资产、联合曲线门槛、DEX 迁移目标、费用与发布确认会随主网同步变化。
- 页面支持简体中文 / English 即时切换。
- 顶部主网选择器使用 BNB Chain 与 Robinhood 官方风格 Logo，并同步市场搜索、发行网络与交易上下文。
- 「我的」页面已改为完整账户中心，所有菜单项均可进入独立子页面，开关、标签页、输入、复制、保存与状态反馈可交互。
- MEME 永续页支持 BSC 与 Robinhood Chain 市场、1–100× 杠杆、逐仓/全仓、开多/开空、市价/限价/止盈止损、保证金和预估强平价展示。
- 市场首页明确区分「MEME 现货」与「MEME 合约」，两类资产使用不同的行情指标和进入路径。
- 永续页支持按 MEME 名称、Ticker 或合约地址查找市场；已有对手池的代币可直接交易，暂无池子的代币会提示创建对手池。
- 任意双链 MEME 合约可进入安全检查流程；钱包签名后直接写入链上 Registry，不经过人工审批。
- 散户与专业做市商可分别创建对手池；主流程简化为“池子类型 → 风险方案 → 投入资金”，多空容量、资金费率、强平保护与单账户上限由系统自动计算，并保留 1–100× 自定义杠杆。
- 链上开仓记录支持 BSC / Robinhood Chain、开多 / 开空筛选，并展示区块、杠杆、保证金、仓位价值、交易哈希与确认状态。

## 5. 本地验证

```bash
node --test tests/rendered-html.test.mjs
npm run build
```

交付时以上命令均已通过。测试会检查：

- 28 个页面全部存在；
- 所有本地文件引用可解析；
- 无 CDN、Base64 图片或运行时 Lucide 依赖；
- K 线插件、字体、图标和代币图片均从 `public/assets/` 加载；
- 入口保留 CSP 和沙盒 iframe。
- 28 个页面的 ID、分组和标题与 `docs/page-structure.json` 完全一致。

## 6. 前端对接说明

当前价格、持仓、成交与创建结果为 UI 原型数据。接入真实链上数据时，建议保持现有 DOM 和视觉组件不变，将以下数据源替换为 API / RPC：

- `tokenCatalog`：代币基础数据、价格、联合曲线与当前钱包持仓；
- `candleData()`：K 线数据；
- 实时成交、持有人、创建者与公告列表；
- 钱包连接、签名、授权、买入/卖出和创建代币操作。
- 永续合约撮合、保证金账户、标记价格、预言机、清算、资金费率和对手池结算引擎。

`public/bitbt-launch-ui-app.html` 内的 `renderActiveToken()`、`applyTradeSide()`、`renderPerpsPair()`、`applyPerpsSide()` 和 `ensureCharts()` 是主要交互入口。

同事使用 Codex 继续开发时，应先让 Codex 阅读根目录 `AGENTS.md` 和 `docs/PAGE-STRUCTURE.md`。每个顶层页面已经通过 `data-panel`、`data-screen-group`、`data-screen-title` 标识；页面跳转统一使用 `data-open` / `data-nav`，不要重新猜测或改写路由结构。

## 7. 不要删除或改成外链的内容

- `public/assets/vendor/lightweight-charts-4.2.3.min.js`
- `public/assets/fonts/`
- `public/assets/icons/`
- `public/assets/branding/`
- `public/bitbt-wallet-ui.html` 中的 CSP 与 `sandbox="allow-scripts allow-same-origin"`

如果需要拆成 React/Vue 组件，先保持上述离线资源路径和交互逻辑，再逐页迁移，避免遗漏子页面。

## 8. 验收建议

收到 ZIP 后先解压，再执行：

```bash
shasum -a 256 -c FILE-MANIFEST.sha256
node --test tests/rendered-html.test.mjs
```

第一条命令用于确认传输过程中没有文件缺失或损坏；第二条命令会执行 5 项检查，覆盖 28 个页面、页面结构文档、CSP、沙盒入口和全部离线资源引用。
