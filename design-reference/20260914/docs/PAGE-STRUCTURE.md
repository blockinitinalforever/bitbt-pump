# BitBT Pump 页面结构与交互地图

本文件面向产品、前端和接手项目的 Codex。源码修改规则见根目录 `AGENTS.md`，机器可读清单见 `docs/page-structure.json`。

## 1. 运行结构

```text
app/page.tsx
└── 重定向 /bitbt-wallet-ui.html
    └── public/bitbt-wallet-ui.html
        ├── Content-Security-Policy
        ├── sandboxed iframe
        └── public/bitbt-launch-ui-app.html
            ├── 全局品牌头 / 主网 / 语言 / 连接钱包
            ├── 顶部页面导航
            ├── 左右产品说明栏
            └── .device
                ├── 状态栏
                ├── 全局公告栏
                ├── .screen-viewport
                │   └── 28 个 section[data-panel]
                ├── 底部五项导航
                └── Toast
```

正式入口始终是 `bitbt-wallet-ui.html`，不是直接打开内层 HTML。

## 2. URL 与页面切换

- 深链格式：`/bitbt-wallet-ui.html?screen=<screen-id>`
- 页面容器：`section.screen[data-panel="<screen-id>"]`
- 页面跳转：`data-open="<screen-id>"`
- 主导航：`data-nav="<screen-id>"`
- 页面切换函数：`show(screenId)`
- 当前主页面：discover、live、rank、create-mode、profile

示例：

```text
?screen=discover
?screen=detail
?screen=trade
?screen=perps
?screen=profile
?screen=invite-center
```

## 3. 28 个页面

| # | 模块 | screen ID | 页面 | 主要入口 | 主要去向 |
|---:|---|---|---|---|---|
| 1 | 市场 | `discover` | 发现市场 | 默认页、顶部/底部导航 | detail、perps、create-mode、action-center |
| 2 | 市场 | `live` | 实时链上 | 顶部/底部导航 | detail |
| 3 | 市场 | `rank` | 排行榜 | 顶部/底部导航 | detail |
| 4 | 市场 | `announcements` | 公告中心 | 全局公告、账户中心 | discover |
| 5 | 现货 | `detail` | 代币详情与 K 线 | 市场卡片、实时动态、排行 | trade |
| 6 | 现货 | `trade` | MEME 现货交易 | detail 的买入/卖出 | detail、activity |
| 7 | 永续 | `perps` | MEME 永续交易终端 | 顶部导航、首页 MEME 合约 | perps-add-contract、perps-create-pool、perps-pool、perps-onchain、action-center |
| 8 | 永续 | `perps-add-contract` | 添加链上 MEME 合约 | perps 搜索/添加入口 | perps-create-pool、perps |
| 9 | 永续 | `perps-create-pool` | 创建 MEME 对手池 | perps、perps-add-contract | perps-pool |
| 10 | 永续 | `perps-pool` | 对手池详情 | perps | perps、action-center |
| 11 | 永续 | `perps-onchain` | 链上开仓记录 | perps | action-center |
| 12 | 发射 | `create-mode` | 创建方式选择 | 首页 Hero、顶部/底部导航 | create-basic |
| 13 | 发射 | `create-basic` | 创建代币：资料 | create-mode | create-economics |
| 14 | 发射 | `create-economics` | 创建代币：发行参数 | create-basic | create-tax |
| 15 | 发射 | `create-tax` | 创建代币：税费与分配 | create-economics | create-review |
| 16 | 发射 | `create-review` | 发布确认 | create-tax | success |
| 17 | 发射 | `success` | 发布成功 | create-review | trade、my-launches |
| 18 | 资产记录 | `my-launches` | 我的发射 | profile、success | create-mode、detail |
| 19 | 资产记录 | `activity` | 交易与收入记录 | profile、trade | detail |
| 20 | 资产记录 | `watchlist` | 我的自选 | profile | detail、action-center |
| 21 | 账户 | `profile` | 我的 / 账户中心 | 顶部/底部导航 | 账户与资产记录全部子页 |
| 22 | 账户 | `income-center` | 收入中心与 Split Vault | profile | profile |
| 23 | 账户 | `developer-tools` | SDK、Webhook 与 Bot | profile | profile、action-center |
| 24 | 账户 | `invite-center` | 邀请返佣与 KOL | profile | profile、create-mode |
| 25 | 账户 | `alert-center` | 价格与迁移提醒 | profile | profile |
| 26 | 账户 | `protection` | 交易保护 | profile、设置入口 | profile |
| 27 | 账户 | `language-center` | 语言与显示 | profile | profile |
| 28 | 系统 | `action-center` | 通用操作中心 | 搜索、设置、确认、流动性、导出 | `lastScreen` |

## 4. 核心用户流程

### MEME 现货

```text
discover / live / rank
→ detail（K 线、曲线、成交、持有人、链上数据）
→ trade（买入 / 卖出）
→ 钱包确认反馈
```

### MEME 永续

```text
discover 的 MEME 合约分类
→ perps（K 线在开多/开空上方）
├── 已有池子 → 开多 / 开空 → action-center 订单确认
├── 没有池子 → perps-create-pool
├── 未添加合约 → perps-add-contract → perps-create-pool
└── perps-onchain（BSC / Robinhood Chain 开仓记录）
```

### 创建代币

```text
create-mode
→ create-basic
→ create-economics（选择 BNB Chain / Robinhood Chain）
→ create-tax
→ create-review
→ success
→ trade 或 my-launches
```

### 创作者与增长

```text
profile
├── my-launches
├── income-center（总览 / Split Vault / 结算记录）
├── developer-tools
├── invite-center（邀请赚手续费 / KOL 合作计划）
├── alert-center
├── protection
└── language-center
```

## 5. 页面内子结构

| 页面 | 标签属性 | 子面板 |
|---|---|---|
| detail | `data-detail-tab` | curve、trades、holders、data |
| income-center | `data-account-tab` | income-overview、income-split、income-records |
| invite-center | `data-account-tab` | invite-fee、invite-kol |
| discover | `data-market-type` | spot、perps |
| trade | `data-trade-side` | buy、sell |
| perps | `data-perps-side` | long、short |

## 6. 全局共享状态

| 状态 | DOM/函数 | 影响范围 |
|---|---|---|
| 当前页面 | `show()`、`?screen=` | 所有顶层页面、顶部与底部导航 |
| 当前语言 | `setLanguage()`、`translations` | 全站文案与输入提示 |
| 当前主网 | `applyGlobalChain()` | 顶部主网、首页搜索范围、发行网络 |
| 发行网络 | `applyLaunchChain()` | 创建流程中的资产、费用、门槛、DEX |
| 当前现货代币 | `tokenCatalog`、`renderActiveToken()` | detail、trade、当前持仓 |
| 当前永续交易对 | `perpsCatalog`、`renderPerpsPair()` | perps、订单估算 |
| 买卖方向 | `applyTradeSide()` | 输入单位、余额、报价和按钮 |
| 多空方向 | `applyPerpsSide()` | 订单按钮和强平估算 |
| 图表实例 | `chartStore`、`ensureCharts()` | detail、trade、perps |
| 返回页 | `lastScreen` | action-center 返回逻辑 |

## 7. 文件修改建议

- 改页面内容、样式或交互：`public/bitbt-launch-ui-app.html`
- 改安全入口：`public/bitbt-wallet-ui.html`
- 改离线字体：`public/assets/fonts/`
- 改品牌/主网 Logo：`public/assets/branding/`、`public/assets/chains/`
- 改 K 线库：`public/assets/vendor/`
- 改 Sites 根入口：`app/page.tsx`
- 改页面清单：本文件 + `docs/page-structure.json` + 测试

修改完成运行 `npm test`。不要编辑 `dist/`；生产构建会自动重新生成。
