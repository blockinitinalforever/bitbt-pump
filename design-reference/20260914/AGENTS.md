# BitBT Pump — Codex 开发约定

本文件适用于整个仓库。开始修改前，先阅读本文件和 `docs/PAGE-STRUCTURE.md`。

## 项目定位

这是 BitBT Pump 的高保真前端交互原型，范围是：

- MEME 发现、实时链上动态与排行榜；
- MEME 现货详情、K 线与买入/卖出；
- BNB Chain / Robinhood Chain 双链代币发射；
- MEME 永续、1–100× 杠杆、添加链上合约、创建对手池与链上开仓记录；
- 创作者收入、邀请返佣、KOL、提醒、保护与语言设置。

不要把本项目扩回通用钱包产品。除非用户明确要求，不新增创建钱包、导入助记词、私钥、DApp、NFT 或资产总览页面。

## 唯一可信源码

- `public/bitbt-launch-ui-app.html`：页面 UI、CSS、演示数据与交互逻辑的唯一可信源。
- `public/bitbt-wallet-ui.html`：正式入口，只负责 CSP 与沙盒 iframe；必须保留。
- `app/page.tsx`：Sites/Vinext 根路由，重定向到正式入口。
- `public/assets/`：全部离线资源。
- `docs/page-structure.json`：28 个页面的机器可读清单。

不要直接修改 `dist/`、`.vinext/`、`.wrangler/`、旧 ZIP 或 `BitBT-*-Complete*/` 交付目录。它们是生成物或历史快照，不是源码。

## 页面结构契约

每个顶层页面都必须是：

```html
<section
  class="screen"
  data-panel="screen-id"
  data-screen-group="market|spot|perps|launch|portfolio|account|system"
  data-screen-title="中文页面名"
>
```

规则：

1. `data-panel` 是稳定页面 ID，也是 `?screen=` 深链参数；不要随意改名。
2. 普通跳转使用 `data-open="screen-id"`。
3. 底部主导航使用 `data-nav="screen-id"`，并同步脚本中的 `mainScreens`。
4. 页面内标签使用成对的 `data-*-tab` / `data-*-panel`，不要创建无对应内容的标签。
5. 新增或删除页面时，同步更新：
   - `docs/PAGE-STRUCTURE.md`
   - `docs/page-structure.json`
   - `tests/rendered-html.test.mjs`
   - 左侧设计说明中的 `SCREENS` 数量
6. 现有页面总数是 28。未得到明确需求时，不创建重复页面。

## 现有七个页面模块

- `market`：discover、live、rank、announcements
- `spot`：detail、trade
- `perps`：perps、perps-add-contract、perps-create-pool、perps-pool、perps-onchain
- `launch`：create-mode、create-basic、create-economics、create-tax、create-review、success
- `portfolio`：my-launches、activity、watchlist
- `account`：profile、income-center、developer-tools、invite-center、alert-center、protection、language-center
- `system`：action-center

详细跳转关系见 `docs/PAGE-STRUCTURE.md`。

## 交互属性

优先复用现有委托式交互，不要为每个按钮单独写重复监听器：

- `data-open`：打开顶层 screen。
- `data-nav`：底部导航。
- `data-action-confirm`：显示操作结果 Toast。
- `data-action-back`：返回上一个 screen。
- `data-account-tab` / `data-account-panel`：收入与邀请中心标签。
- `data-detail-tab` / `data-detail-panel`：代币详情标签。
- `data-trade-side="buy|sell"`：现货买卖。
- `data-perps-side="long|short"`：永续开多/开空。
- `data-market-type="spot|perps"`：首页市场分类。
- `data-launch-chain="bnb|robinhood"`：发行网络。
- `data-global-chain-option="bnb|robinhood"`：全局主网切换。
- `data-profile-toggle`：设置开关。

所有可点击元素必须满足至少一种：进入页面、切换内容、修改可见状态或显示明确反馈。禁止留下“看起来能点但无反应”的控件。

## 状态与数据入口

`public/bitbt-launch-ui-app.html` 中的主要入口：

- `tokenCatalog`：现货代币与钱包持仓演示数据。
- `perpsCatalog`：永续市场演示数据。
- `translations`：中文到英文的文本映射。
- `show(screenId)`：顶层页面切换与 URL 同步。
- `renderActiveToken()`：选币后更新详情、交易与持仓。
- `applyTradeSide()`：买入/卖出状态。
- `renderPerpsPair()`：永续交易对状态。
- `applyPerpsSide()`：开多/开空状态。
- `applyLaunchChain()` / `applyGlobalChain()`：BNB Chain 与 Robinhood Chain 上下文。
- `ensureCharts()`：本地 Lightweight Charts 初始化。
- `actionContent` / `openAction()`：通用系统操作页。

接入真实 API/RPC 时，保持 DOM 结构与页面 ID 稳定，先替换这些数据入口，不要整页重写。

## 视觉与响应式约束

- 视觉基调：黑色高密度交易界面，黄色用于主操作，绿色/红色只表达涨跌与方向。
- 避免通用 AI 仪表盘风格、无意义渐变、过量圆角和大段空白。
- 先保证操作顺序易懂，再增加装饰。
- 桌面端、平板与手机必须共享同一信息顺序。
- 关键断点已经覆盖 1440、1100、760、560、440、350px；新增布局必须检查 390px 与 1440px。
- 触摸控件保持足够面积；不可只依赖 hover。
- 保留 `100dvh`、安全区和底部导航适配。

## 离线资源与安全约束

- 禁止 CDN、远程字体、Base64 图片、`data:image` 和运行时 Lucide。
- 图标使用 `public/assets/icons/lucide/*.svg` 的本地 CSS mask。
- K 线使用 `public/assets/vendor/lightweight-charts-4.2.3.min.js`。
- 字体只从 `public/assets/fonts/` 加载。
- BNB Chain 与 Robinhood Chain 使用 `public/assets/chains/*-brand.png`。
- 必须保留入口 CSP 和 `sandbox="allow-scripts allow-same-origin"`。
- UI 是原型；不要把演示按钮描述成已经执行真实链上交易。
- 永远不要收集、保存或演示真实助记词、私钥。

## 修改流程

1. 在 `public/bitbt-launch-ui-app.html` 修改源码。
2. 如果增加文案，同步 `translations`。
3. 如果改变页面或跳转，同步两个页面结构文档。
4. 执行：

```bash
npm test
```

5. 检查 `git diff --check`。
6. 只有用户要求时才重新打包或发布；不要覆盖历史交付包。

## 完成标准

- 28 个页面仍能通过 `?screen=<id>` 访问。
- 所有新增入口有对应页面或反馈。
- 中英文切换后新增文案没有遗留中文。
- 现货、永续、发射、账户四条主流程没有断链。
- BNB Chain / Robinhood Chain 状态同步。
- 所有本地引用存在；CSP、沙盒、字体、图标和 K 线离线可用。
- `npm test` 四项全部通过。
