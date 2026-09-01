# BitBT Pump 完整运营数据与 Flap 对标规划

> 数据快照：2026-09-01（Europe/London）  
> 生产环境：`https://bitbt.fun`、BSC Mainnet（chainId `56` / `0x38`）  
> 文档目的：统一运营、财务、产品和研发口径；生产数据与理论收入必须分开，不得把配置金额当作已到账金额。

## 1. 执行结论

BitBT Pump 已具备发币、标准/税费代币、联合曲线买卖、DEX 路由、行情、K 线、成交、持有人、排行榜、收藏、提醒、评论、邀请、KOL、钱包活动和创建者奖励账本等核心能力。

当前最大的运营任务不是补历史数据，而是建立一个明确的运营起算点，并保证起算点之后的发币、成交、税收、奖励和 Treasury 到账完整可追溯。上线前记录全部视为测试/旧数据，不进入新运营报表，也不进行历史补账。

推荐建设顺序：

1. P0：建设 Split Vault 与统一用户收入中心。
2. P1：建设回购销毁、分红、质押、空投等收入策略 Vault。
3. P2：建设 Vault Factory、动态配置 Schema 和 Vault Store。
4. P3：完成 SDK、Webhook、第三方终端和 Bot 开放生态。
5. P4：完成更多计价资产、多 DEX 和 LP Fee Holder Reward。
6. P5：最后建设正式运营起算点、实时账本、Treasury 对账和运营后台。

执行约束：正式运营数据模块最后开发；在 P0–P4 功能完成前，不启动运营后台和运营财务聚合开发。

## 2. 当前生产配置

生产接口：

- Economics：`https://bitbt.fun/api/pump/v1/pump/economics/config`
- Market：`https://bitbt.fun/api/pump/v1/pump/market`
- Tokens：`https://bitbt.fun/api/pump/v1/pump/tokens`

| 配置 | 当前值 | 说明 |
| --- | ---: | --- |
| 发币费 | 0.01 BNB | 每次成功付费发币，独立于交易手续费 |
| Pump 交易手续费 | 50 ppm = 0.005% | 交易额乘以 `0.00005` |
| 创建者协议费分成 | 20% | 由 3.2.0 曲线累计给创建者 |
| 平台链上接收 | 80% | 协议费扣除创建者份额后的链上到账 |
| 营销预留 | 协议费的 10% | 后台记账，需 Treasury 结算 |
| 平台币分红预留 | 协议费的 20% | 尚需持仓快照和兑付闭环 |
| KOL 分成上限 | 协议费的 20% | 只有审核通过且存在 Campaign 归因时分配 |
| 税费代币默认买税 | 5% | 可在 1%–10% 范围修改 |
| 税费代币默认卖税 | 5% | 可在 1%–10% 范围修改 |
| 默认税费分配 | 40/20/20/20 | 收款地址/销毁/持币分红/自动流动性 |
| 税费接收地址 | Owner | 默认连接钱包地址，发布前可以修改 |
| 永续合约 | 关闭 | 不进入当前普通 Pump 运营数据 |

生产验证状态：市场中有 26 个已部署项目，其中 25 条曲线已登记为 3.2.0、50 ppm、创建者 20% 分账。旧项目 `Gwallet Test / GTEST2` 的曲线未进入验证清单，必须单独标记为未验证，不得按新费率汇总。

## 3. 上线前生产观察数据（不进入运营账）

本节只用于说明当前系统中有什么存量项目和测试记录，不作为新运营收入、成交量、用户增长或分红的期初数据。正式运营报表在起算区块处将累计成交额、收入、奖励和新增用户统一从 0 开始。

已有代币仍可继续交易；只要交易发生在运营起算区块之后，就按新规则计入运营数据。起算区块之前的创建、成交、收费和奖励一律排除。

### 3.1 发币与项目

| 指标 | 数量 | 口径 |
| --- | ---: | --- |
| 发币流程记录 | 42 | `token_launches` 全状态 |
| 已部署 | 26 | `status=deployed` |
| 已迁移 DEX | 0 | `status=migrated` |
| Prepared | 12 | 已准备参数但未完成链上确认 |
| Deploy Failed | 2 | 部署失败 |
| Quarantined | 2 | 已隔离，不进入正常市场统计 |
| 独立创建者 | 10 | 创建者地址去重 |
| 已部署标准代币 | 17 | `enable_tax=false` |
| 已部署税费代币 | 9 | `enable_tax=true` |

关键转化率：

- 全流程记录到已部署：26 / 42 = 61.90%。
- 已部署项目中的税费代币占比：9 / 26 = 34.62%。
- DEX 迁移率：0%。
- 失败与隔离占全部流程：4 / 42 = 9.52%。

注意：Prepared 可能包含用户主动放弃、Session 过期、余额不足和签名取消，不能全部归类为技术失败。运营后台必须进一步记录每一步退出原因。

### 3.2 交易与用户

| 指标 | 当前值 |
| --- | ---: |
| Pump 买卖记录 | 15 |
| Confirmed/Success | 14 |
| Pending | 1 |
| 买入记录 | 10 |
| 卖出记录 | 5 |
| 独立交易钱包 | 4 |
| 发生交易的代币 | 4 |
| 累计确认成交额 | 0.147568 BNB |
| 最近 7 天确认成交额 | 0.001001 BNB |
| 最近 24 小时成交 | 1 笔 / 0.000001 BNB |

生产 Market API 当时缓存的 BNB 价格约为 690.47 USDT，因此：

- 累计确认成交额约 101.89 USDT。
- 最近 7 天约 0.69 USDT。
- 最近 24 小时约 0.00069 USDT。

这些美元金额是快照时换算值，不应覆盖原始 BNB 数量。正式报表必须同时保存原币金额、换算价格、价格时间和价格来源。

### 3.3 发币费

| 状态 | 已记录收费笔数 | 金额 |
| --- | ---: | ---: |
| 已部署项目 | 3 | 0.03 BNB |
| 隔离项目 | 2 | 0.02 BNB |
| 合计 | 5 | 0.05 BNB |

按快照价格约为 34.52 USDT，其中已部署项目对应约 20.71 USDT，隔离项目对应约 13.81 USDT。

这些收费发生在正式运营起算点之前，全部排除，不需要逐笔补账。起算点之后的新发币费必须使用链上回执和 Treasury 到账实时对账。

### 3.4 协议收入账本

当前旧 `pump_revenue_ledger` 有 2 条事件：

- 账本成交额：0.001001 BNB。
- 账本手续费：0.00001001 BNB。
- 两条记录来自旧费率阶段，元数据中的实际费率为 10,000 ppm（1%）。
- 当前生产费率已切换为 50 ppm（0.005%），旧账本不进入新运营报表。

结论：不补这 15 条旧交易，也不重算旧协议收入。运营后台按 `event_block >= operations_start_block` 强制过滤，起算点后的事件必须 100% 实时入账。

### 3.5 奖励、持有人和增长

| 指标 | 当前值 | 备注 |
| --- | ---: | --- |
| 创建者奖励账本 | 2 条 | 旧数据，不进入新运营报表 |
| 营销奖励账本 | 2 条 | 旧数据，不进入新运营报表 |
| 平台分红账本 | 2 条 | 旧数据，不进入新运营报表 |
| KOL 奖励账本 | 0 条 | 当前成交没有有效 KOL 归因 |
| 已索引持有人 | 5 个地址 | 覆盖 3 个代币 |
| 积分用户 | 1 | 共 2 积分、1 条事件 |

## 4. 不同交易量的收入模型

统一假设：

- 交易量是买入和卖出的合计 Gross Volume。
- 税费代币买卖税都为默认 5%。
- 税费分配使用默认 40/20/20/20。
- 不考虑价格冲击、失败交易、豁免地址、税币换成计价资产时的滑点。
- 发币费另计，不包含在交易量收入中。

### 4.1 税费代币收入

| 总交易量 | 总税收 5% | Owner 收款 40% | 销毁 20% | 持币分红 20% | 流动性 20% |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 U | 500 U | 200 U | 100 U | 100 U | 100 U |
| 100,000 U | 5,000 U | 2,000 U | 1,000 U | 1,000 U | 1,000 U |
| 1,000,000 U | 50,000 U | 20,000 U | 10,000 U | 10,000 U | 10,000 U |

创建者默认可直接收到总交易量的 2%，即 `5% × 40%`。其他 60% 是协议用途，不是创建者可直接提走的现金。

### 4.2 Pump 协议费

| 总交易量 | 协议费 0.005% | 创建者 20% | 平台链上收到 80% | 营销 10% | 平台币分红 20% | KOL 上限 20% |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 U | 0.50 U | 0.10 U | 0.40 U | 0.05 U | 0.10 U | 0.10 U |
| 100,000 U | 5 U | 1 U | 4 U | 0.50 U | 1 U | 1 U |
| 1,000,000 U | 50 U | 10 U | 40 U | 5 U | 10 U | 10 U |

平台净留存：

- 有 KOL 归因：总协议费的 30%，即 0.15 / 1.5 / 15 U。
- 无 KOL 归因：KOL 不生成应付账，平台暂留可达到总协议费的 50%，即 0.25 / 2.5 / 25 U。
- “暂留”不等于可分配利润，仍需扣除 RPC、服务器、审计、运营和活动预算。

### 4.3 创建者综合直接收入

默认 Owner 同时是项目创建者时，直接收入为：税费 Owner 份额 + 创建者协议费份额。

| 总交易量 | Owner 税收款 | 创建者协议分成 | 合计直接收入 |
| ---: | ---: | ---: | ---: |
| 10,000 U | 200 U | 0.10 U | 200.10 U |
| 100,000 U | 2,000 U | 1 U | 2,001 U |
| 1,000,000 U | 20,000 U | 10 U | 20,010 U |

若 Owner 同时持有代币，还可能按持仓额外获得持币分红；这部分不能在没有持仓快照时提前计算。

## 5. 完整运营后台数据模型

### 5.1 总览 Dashboard

必须支持 Today、24H、7D、30D、All Time：

- 发币数、部署成功率、税费币占比、迁移率。
- Gross Volume、Buy Volume、Sell Volume、Net Flow。
- 交易笔数、独立交易者、新交易者、复购交易者。
- 发币费、协议费、税费代币总税收、平台 Gross/Net Revenue。
- 创建者、营销、平台分红、KOL 的 accrued/claimable/paid/failed。
- 活跃项目、活跃创建者、活跃交易者。
- API、RPC、WSS、索引器和 K 线健康状态。

### 5.2 发币漏斗

建议事件：

1. `wallet_connected`
2. `launch_form_started`
3. `logo_selected`
4. `logo_uploaded`
5. `prepare_launch_succeeded`
6. `snapshot_rendered`
7. `signature_requested`
8. `signature_rejected`
9. `transaction_broadcast`
10. `transaction_confirmed`
11. `launch_saved`
12. `detail_opened`

每一步记录 `session_id`、钱包、launch_id、token、设备、钱包类型、来源、耗时和标准化失败原因。禁止记录私钥、签名原文或带凭据 RPC。

### 5.3 收入与财务

每笔收入至少需要：

- 链、区块、交易哈希、日志索引、确认数。
- token、curve、quote token、交易方向。
- Gross Amount、Fee Amount、Tax Amount。
- 创建者、平台、营销、分红、KOL、销毁、流动性实际金额。
- 原币单位、decimals、人类可读金额、USD 换算价和时间。
- `expected / accrued / claimable / paid / failed / reversed` 状态。
- Treasury 实际到账交易和对账差异。

不得把配置比例直接当作收入；只有链上最终事件或已确认 Treasury 流水才算 Actual Revenue。

### 5.4 项目与市场

- 状态：Prepared、Deployed、Tradable、Almost Bonded、Migrated、Quarantined、Failed。
- 价格、Market Cap、FDV、Curve Reserve、DEX Liquidity。
- 5m/30m/1h/4h/24h 成交额和交易数。
- 买卖比、净流入、独立交易者、平均订单额。
- 持有人数、Top 10 占比、创建者持仓、Curve/Pair 持仓剔除。
- K 线最新时间、缺口数、去重数和回补状态。
- 税率、税收周期、反机器人参数和实际税收执行状态。

### 5.5 增长和活动

- 邀请码创建、绑定、首笔成交激活和归因收入。
- KOL 申请、审核、Campaign、归因成交额、应付和已付。
- 收藏、提醒、评论、分享和详情页转化。
- 新用户、次日/7日/30日留存。
- 钱包类型：MetaMask、OKX、TokenPocket、Binance Wallet、WalletConnect 等。
- 流量来源：官网、Telegram、X、KOL、Direct、第三方终端。

### 5.6 风控与系统健康

- 高税、卖出失败、交易模拟失败、余额不足、授权失败。
- 大户集中、创建者异常卖出、自成交/刷量、短时多钱包关联。
- RPC 429、超时、fallback 切换、WSS 重连、落后区块。
- Quote P50/P95/P99 延迟和错误率。
- K 线/成交/持有人索引延迟。
- Treasury 账实不符、重复事件、漏记事件和实时索引任务状态。

## 6. 需要新增的运营接口

以下接口必须是后台权限接口，不能暴露 API Key、RPC 或内部 Treasury 信息：

- `GET /api/v1/pump/admin/operations/summary`
- `GET /api/v1/pump/admin/operations/revenue`
- `GET /api/v1/pump/admin/operations/launch-funnel`
- `GET /api/v1/pump/admin/operations/tokens`
- `GET /api/v1/pump/admin/operations/users`
- `GET /api/v1/pump/admin/operations/rewards`
- `GET /api/v1/pump/admin/operations/reconciliation`
- `GET /api/v1/pump/admin/operations/health`
- `GET /api/v1/pump/admin/operations/cursor`
- `GET /api/v1/pump/admin/operations/export.csv`

所有聚合接口必须按时间、token、creator、quote token、交易方向、税费模式、钱包类型和流量来源筛选。

## 7. P5 正式运营起算方案（产品功能完成后最后开发）

### 7.1 设置起算点

- 部署时读取 BSC 已最终确认的安全区块，写入不可随意修改的 `pump_operations_start_block`。
- 同时写入 `pump_operations_started_at` 和部署版本，作为报表统一起点。
- 新运营报表初始成交额、收入、税收、奖励和新增用户全部为 0。
- 起算区块之前的数据保留在数据库中但统一过滤，不删除、不补账、不重新计算。
- 已存在代币在起算点之后发生的新交易、税收、领取和迁移正常计入。

### 7.2 向前实时索引

- WSS 从起算区块之后持续监听 Factory、Curve、TaxToken 和迁移事件。
- HTTP fallback 只补 WSS 断线期间、且不早于起算区块的缺口。
- 使用 `(chain_id, tx_hash, log_index)` 作为不可重复事件键。
- 每个游标保存最后扫描区块、最新链上区块、确认数和落后区块数。
- 进程重启和 WSS 重连必须幂等，不得重复计费。

### 7.3 发币费对账

- 只处理起算区块之后创建的 `token_launches`。
- 读取 `fee_tx_hash`、`deploy_tx_hash` 和最终链上回执。
- 区分已付成功、已付后失败、隔离、退款和未知。
- 对比收费地址的链上入账，不依赖前端上报状态。
- 生成差异表，未经处理的差异不得进入正式收入。

### 7.4 税收账本

新增税收事件字段：

- `gross_tax_token_amount`
- `recipient_token_amount`
- `burn_token_amount`
- `holder_token_amount`
- `liquidity_token_amount`
- 实际兑换出的 quote amount
- recipient、holder dividend、liquidity 的实际付款交易
- 未处理余额和失败原因

### 7.5 每日快照

每日 UTC 00:00 后生成不可变快照：

- 原始链上区间和最终区块。
- 各币种交易量、收入、应付和已付。
- 项目、交易者和持有人数量。
- 数据完整率、落后区块和对账差异。
- 快照哈希，修改必须生成新版本而不是覆盖。

## 8. Flap 官方入口与主网合约

### 8.1 官方入口

- 产品：`https://flap.sh`
- 创建：`https://flap.sh/create?lang=en`
- Vault Store：`https://flap.sh/bnb/CAstore`
- 我的资产/分红：`https://flap.sh/me?lang=en`
- 开发文档：`https://docs.flap.sh/flap/developers`
- 已部署合约：`https://docs.flap.sh/flap/developers/deployed-contract-addresses`
- Token 检查：`https://docs.flap.sh/flap/developers/inspect-a-token`
- Token 迁移：`https://docs.flap.sh/flap/developers/token-migration`
- Vault 规范：`https://docs.flap.sh/flap/developers/vault-developers/vault-and-vaultfactory-specification`
- Registered Vaults：`https://docs.flap.sh/flap/developers/token-launcher-developers/registered-vaults`

### 8.2 BNB Mainnet 地址

以下地址来自 Flap 官方文档，仅用于研究和可选互操作，不属于 BitBT：

| 合约 | 地址 | 用途 |
| --- | --- | --- |
| Portal v5.8.6 | `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` | 发币、曲线与状态入口 |
| Standard Token Impl | `0x8b4329947e34b6d56d71a3385cac122bade7d78d` | 标准代币实现 |
| Tax Token V1 Impl | `0x29e6383F0ce68507b5A72a53c2B118a118332aA8` | 旧税费代币实现 |
| Tax Token V2 Impl | `0xae562c6A05b798499507c6276C6Ed796027807BA` | 税费代币 V2 |
| Tax Token V3 Impl | `0x024f18294970B5c76c0691b87f138A0317156422` | 税费代币 V3 |
| VaultPortal | `0x90497450f2a706f1951b5bdda52B4E5d16f34C06` | Vault 发币入口 |
| Trigger Service | `0xcf4EE25035CF883895110f367F5BA8172416a7F9` | 自动执行服务 |
| AI Oracle | `0xaEe3a7Ca6fe6b53f6c32a3e8407eC5A9dF8B7E39` | AI Oracle 预览 |
| Tax Token Helper | `0x53841c73217735F37BC1775538b03b23feFD8346` | 税币辅助读取 |
| Guardian | `0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b` | Vault 权限后备地址 |
| Split Vault Factory | `0xfab75Dc774cB9B38b91749B8833360B46a52345F` | 最多 10 个地址按 bps 拆分 |
| Gift Vault Factory | `0x025549F52B03cF36f9e1a337c02d3AA7Af66ab32` | X 身份证明和收入路由 |

不要在 BitBT 生产前端直接把这些地址当作 BitBT 合约。若选择互操作，必须独立检查链上 bytecode、Owner/Guardian、可升级性、权限、ABI 和审计报告。

## 9. Flap 已有而 BitBT 仍缺少的能力

### 9.1 Vault 生态

Flap 的 Vault Store 已展示：

- Split Vault，多地址拆分。
- Gift Vault，基于 X 证明路由收入。
- 自动回购销毁。
- AI Smart Buyback / Buffett Vault。
- Dynamic Airdrop。
- Strategic Reserve / RWA / Stocks。
- Burn Dividend。
- LP Staking Dividend。
- Token Staking Dividend。
- Staking & Lucky Draw。

BitBT 当前只有固定的收款、销毁、持币分红、流动性四路比例，没有可插拔 Vault Factory、商店、动态 UI Schema 和第三方开发者佣金。

### 9.2 统一分红中心

Flap 的 Me 页面具有 My Assets、Dividend、Claim All，并声明达到约 4 USD 后自动分发，低于阈值可手动领取。BitBT 当前有创建者奖励账本和税币 `claimDividend()`，但没有把所有税币、Vault、创建者奖励统一成一个领取中心。

### 9.3 扩展与第三方终端

Flap 文档为 Wallet、Terminal、Bot 开发者提供创建事件索引、`getTokenV7`、交易和迁移事件规范。其 Token State 已逐步包含：

- 状态、储备、流通量、价格。
- Quote Token、曲线参数、迁移进度。
- Tax Rate、Pool。
- Extension/plugin ID。
- Multi-DEX 和 LP Fee Profile。

BitBT 已有自己的 REST/WSS API，但尚缺公开稳定的开发者 SDK、版本化事件规范、Webhook 和第三方终端接入文档。

### 9.4 更多计价资产与 DEX

Flap 创建页展示 BNB、USDT、USD1、U、BTCB、SOL、ETH 等计价资产。BitBT 当前发币页提供 BNB、USDT、USDC、USD1，迁移路由固定 PancakeSwap V2；缺少多 DEX 选择和 LP 费率档位。

### 9.5 标准代币持有人收益

Flap 声明 Non-tax Token 可利用 DEX LP Fee 奖励持有人。BitBT 标准代币当前没有对应的 LP Fee Holder Reward 产品。

## 10. BitBT 实施规划

### Phase 0：BitBT Split Vault 与 Revenue Center

当前 TaxToken 的 `recipient` 可以设置为有效合约地址，因此可先实现 BitBT 自有 Split Vault：

- 1–10 个收款地址。
- basis points 合计 10,000。
- Pull Claim 优先，避免一次 dispatch 因单个地址失败全部回滚。
- 每个收款人显示 claimable、claimed 和历史流水。
- Vault Factory 可为每个项目部署独立 Vault。
- 发币页面增加“普通 Owner / 多地址拆分”选择。

限制：第一阶段只处理现有 40% recipient 收入，不改变当前销毁、持币分红和自动流动性逻辑。

统一 Revenue Center 同期接入：

- 我的创建者协议奖励。
- 我的税费 Recipient 收入。
- 我的持币分红。
- 我的 Vault 分成。
- Claim All，但每个 Claim 保留独立交易结果，避免一个失败阻塞全部。
- 可配置自动分发阈值；Keeper 资金和权限独立管理。

### Phase 1：Buyback/Burn 与 Holder Vault

- Buyback & Burn Vault。
- Holder Dividend Vault。
- LP Staking Dividend Vault。
- Token Staking Dividend Vault。
- 所有 Swap 设置最小输出、TWAP/Oracle 保护、执行冷却和 MEV 风险控制。

这些合约必须经过独立审计和 BSC Testnet 实盘，不能直接从 Flap 文档复制部署。

### Phase 2：Vault Schema 与 Store

- `VaultFactoryRegistry`：Factory、版本、审计状态、支持资产和风险等级。
- `vaultDataSchema()`：前端读取字段 Schema 自动生成发币配置表单。
- `vaultUISchema()`：前端自动展示 Vault 可执行动作和状态。
- Vault Store：官方、社区、未验证三层展示。
- Factory 开发者佣金和透明费率。
- 上架、下架、暂停和漏洞响应流程。

### Phase 3：开放开发者生态

- TypeScript SDK、ABI、事件和索引示例。
- `/tokens`、`/market`、`/trades`、`/candles`、`/migration` 版本化规范。
- Webhook：new token、trade、almost bonded、migrated、tax dispatch。
- Terminal/Bot API Key、速率限制、签名验证和状态页。
- 第三方钱包和交易终端合作。

### Phase 4：多 DEX 与更多资产

- 对 quote token、router、factory、pair init hash 建立后端白名单。
- Pancake V2 之外的 DEX 必须逐一实现报价、迁移、LP 锁定/销毁证明和索引。
- 多 DEX 不能仅由前端传入 Router 地址。
- 新计价资产必须验证流动性、decimals、Permit/Approve 和价格来源。

### Phase 5：正式运营数据（最后做）

目标：功能开发完成后，从明确起算点开始形成正式运营数据。

- 固化正式运营起算区块和起算时间。
- 建立统一链上事件表和向前实时索引。
- 起算点之后完整记录发币费、协议费、税费、领取和迁移账本。
- 建立每日快照、差异表和 Admin 运营 API。
- 运营后台先只读，不提供直接转账按钮。

验收：起算点之后任意一笔交易可从区块事件追踪到交易记录、收入账本、奖励应付和 Treasury 到账；断线补扫和进程重启不重复计费。

## 11. 快速决策建议

可以立即开工：

1. Split Vault，只接现有 Recipient 40% 收入。
2. 统一 Revenue Center。
3. Buyback/Burn 与 Holder Vault。

需要合约审计后开工：

1. 自动回购销毁。
2. LP/Token 质押分红。
3. Keeper 自动分发。
4. 第三方 Vault Factory。
5. 多 DEX 迁移。

正式运营起算点、运营账本和 Admin Dashboard 排在上述功能之后最后开发。

不建议直接做：

- 直接调用 Flap Portal 替代 BitBT Factory，这会让 BitBT 的费率、Treasury、索引和品牌依赖 Flap。
- 未审计直接复制 Flap 合约或 ABI 行为。
- 对外宣传起算点之前的历史收入或分红规模。
- 在没有真实预算和审批系统前承诺固定回本、固定奖励或必然上所。

## 12. 完成标准

“完整运营数据”只有满足以下条件才算完成：

- 100% 起算点之后的新项目有可验证的创建和发币费状态。
- 100% 起算点之后的最终确认买卖事件进入交易和收入账本。
- 税费四路分配与实际执行金额可核对。
- Treasury 入账和应付账本每日自动对账。
- 所有 USD 数字保留原币、价格、来源和时间。
- Admin 可以按时间、项目、创建者、币种、税费模式导出。
- 断线补扫幂等，WSS 重连不会重复记账。
- 运营后台与公开市场页面使用同一份已确认数据源。

在这些条件完成前，当前生产快照应标记为“产品运营数据”，而不是“审计完成的财务数据”。

## 13. 建议拆分的开发任务（按实际执行顺序）

为了避免再次把合约、API、前端和部署混在同一个 PR，功能开发先拆成独立切口；运营账本相关切口全部留到最后：

### Contract-A：BitBT Split Vault

- 独立 Foundry 工程测试和安全 Review。
- Pull Claim、最多 10 个唯一非零地址、bps 合计 10,000。
- 原生 BNB 与批准的 BEP-20 分开处理。
- Factory、事件、读取接口和紧急暂停边界必须明确。
- 先 BSC Testnet，主网部署需要新的独立批准。

### API-A：Vault 配置与统一收入中心

- 返回 Factory 配置、确定性 Vault 地址和创建交易参数。
- 聚合创建者奖励、税费 Recipient、持币分红和 Vault claimable。
- 所有钱包私有数据必须同时校验 API Key 与 SIWE Session。

### Pump-A：Vault 与收入中心界面

- 创建代币时配置固定分成收款人与比例。
- 展示 claimable、claimed 和 Claim All；单项失败不能阻断其他领取。
- 桌面端与移动端均可完成配置、签名、回执和失败恢复。

### Contract/API-B：收益策略 Vault 与 Vault Store

- Buyback & Burn、Holder Dividend、LP Staking Dividend。
- Vault 模板发现、风险标签、部署参数预览和链上验证。
- 完成 SDK/Webhook/Bot、资产和多 DEX 能力后，再进入运营数据阶段。

### Ops-A：运营起算点与实时账本（最后开发）

- 新增统一 `pump_chain_events` 表。
- 固化 `pump_operations_start_block`，旧数据统一排除。
- 向前监听 Factory、Curve、TaxToken 和 DEX 迁移事件。
- 将确认事件幂等写入交易、收入和奖励账本。
- 输出起算点后的缺失、重复、回滚和未验证曲线报告。
- 只做账本，不改公开页面。

### Ops-B：运营聚合与对账接口（最后开发）

- 实现第 6 节的只读 Admin API。
- 增加每日快照、Treasury 对账和 CSV 导出。
- 返回数据完整率及最后索引区块，禁止用不完整数据伪装完整结果。
- 独立于 Gwallet 后台和数据库部署路径。

### Ops-C：只读运营后台（最后开发）

- 总览、收入、项目、交易者、奖励、漏斗、系统健康七个页面。
- 全部数据来自 Admin API，不在浏览器计算财务口径。
- 地址和交易哈希链接 BscScan。
- 桌面端表格、移动端卡片；支持 CSV 导出。

执行顺序固定为 Contract-A → Vault API/收入中心 → 策略 Vault/Vault Store → 开放生态与多 DEX → Ops-A/Ops-B/Ops-C。正式运营数据不与前述功能并行抢跑。

## 14. 拟新增功能总清单

### P0：用户收入中心

- BitBT Split Vault，最多 10 个地址拆分 Recipient 收入。
- Vault 每个收款人的 claimable、claimed 和流水。
- 创建者协议奖励统一展示。
- 税费 Recipient 收入统一展示。
- 持币分红统一展示。
- Vault 分成统一展示。
- Claim All 聚合操作及单项失败隔离。
- 可配置自动分发阈值和 Keeper 状态。

### P1：收入策略 Vault

- Buyback & Burn Vault。
- Holder Dividend Vault。
- LP Staking Dividend Vault。
- Token Staking Dividend Vault。
- Dynamic Airdrop Vault。
- Strategic Reserve / RWA Vault。
- Gift/X Proof Vault。
- Staking & Lucky Draw Vault。
- AI Buyback 作为后续可选功能。
- Swap 最小输出、TWAP/Oracle、冷却和 MEV 保护。

### P2：Vault Store 与开发者平台

- Vault Factory Registry。
- `vaultDataSchema()` 动态生成发币配置表单。
- `vaultUISchema()` 动态生成 Vault 操作界面。
- 官方、社区、未验证三级 Vault Store。
- Factory 版本、支持资产、审计和风险标识。
- 第三方 Factory 开发者佣金。
- Vault 上架、下架、暂停和漏洞响应流程。

### P3：终端和开放生态

- TypeScript SDK、ABI 和索引示例。
- Tokens、Market、Trades、Candles、Migration 版本化 API。
- New Token、Trade、Almost Bonded、Migrated、Tax Dispatch Webhook。
- Terminal/Bot 独立 API Key、签名验证和速率限制。
- 第三方钱包、交易终端和 Bot 合作接入。
- 公开服务状态页和开发者文档。

### P4：资产与 DEX 扩展

- U、BTCB 等新增计价资产评估与白名单。
- 多 DEX 路由和迁移选择。
- Pancake V2/V3 等不同 LP Fee Profile。
- 每个 DEX 独立报价、迁移和 LP 证明。
- 标准代币的 DEX LP Fee 持有人奖励。

### P5：正式运营数据（最后开发）

- 正式运营起算区块和起算时间。
- 起算点之后的 Factory、Curve、TaxToken、迁移实时事件账本。
- WSS 断线区间 HTTP 补扫和幂等去重。
- 发币费链上回执与 Treasury 到账对账。
- Pump 协议费及创建者/平台分账流水。
- 税费代币收款、销毁、持币分红、流动性四路实际流水。
- 创建者、营销、平台分红、KOL 应付/可领取/已支付/失败状态。
- 每日不可变运营快照和快照哈希。
- 数据完整率、索引游标、落后区块和账实差异监控。
- 运营总览、收入、项目、用户、奖励、漏斗和系统健康后台。
- 时间、项目、创建者、计价币、税费模式、钱包和来源筛选。
- CSV 导出和 BscScan 交易追踪。

优先执行 P0–P4 功能；P5 正式运营数据在前述功能完成后最后开发。
