# BitBT Wallet 视觉资源清单

本目录是 APP 与 Web 共用的离线视觉资源库。所有页面引用均为相对路径，不依赖 CDN、base64 或运行时图标库。

## 目录

- `branding/`：Logo 透明 PNG 与 SVG 母版。
- `icons/lucide/`：76 个实际使用图标，SVG 为 24×24 画布，PNG 为 96×96。
- `tokens/`：代币占位图，SVG 128×128，PNG 256×256。
- `chains/`：链/网络占位图，SVG 128×128，PNG 256×256。
- `navigation/`：底部导航图标，SVG 128×128，PNG 128×128。
- `states/`：空状态、安全、成功插图，SVG 320×240，PNG 640×480。
- `fonts/`：8 个 WOFF2 与离线 `fonts.css`。
- `vendor/`：Lightweight Charts 4.2.3 本地运行文件。
- `app-icons/`：iOS AppIcon、Android mipmap/adaptive icon、PWA 与 React Native 图标。
- `previews/screens/`：53 个页面，每页 PNG + JPG。
- `licenses/`：所有第三方资源许可证。

## 清单文件

- `ASSET-MANIFEST.json`：包含资源数量、路径、字节大小和格式。
- `ASSET-MANIFEST.csv`：适合在 Excel/Numbers 中筛选。
- `previews/SCREEN-MANIFEST.csv`：页面名、PNG/JPG 文件及深链地址。

## 使用建议

- 设计工具优先导入 SVG；移动端位图场景使用同名 PNG。
- Lucide SVG 被页面作为 CSS mask 使用，因此能继承父元素颜色。
- 代币、链和状态图均为可替换占位资产，正式上线前可按同名文件直接覆盖。
- APP 图标已按平台目录组织，不需要再次手工缩放。
