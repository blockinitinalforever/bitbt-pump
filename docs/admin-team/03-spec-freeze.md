# Spec Freeze — BitBT Admin Phase 1

## 冻结时间
2026-07-25 10:44:29

## 范围
管理站 `admin.bitbt.com`：单管理员登录、团队成员 CRUD + 排序、联系表单只读列表；公网站点通过 `GET /api/team` 拉取团队数据（失败时静态回退）。Phase 1 **不含**成员头像/Logo。

## 冻结 Spec 总览

| Spec-ID | 标题 | 优先级 |
|---------|------|--------|
| ADM-01 | 管理站部署与单管理员账号 | P0 |
| ADM-02 | 安全会话与登录防护 | P0 |
| ADM-03 | 团队成员 CRUD + 排序 | P0 |
| ADM-04 | 联系表单只读分页列表 | P0 |
| ADM-05 | 公开 Team API + 官网回退 | P0 |

---

### Spec-ID: ADM-01
- **标题**: 管理站部署与单管理员账号
- **描述**: 在现有 Ubuntu 服务器上，由 Nginx 托管管理站静态前端，同域反向代理 `/api` 至 Rust Axum（`backend/`，PostgreSQL）。部署时创建唯一用户名 `admin`，初始密码为强随机值并仅在部署输出中展示一次。
- **验收标准**:
  1. `https://admin.bitbt.com` 可访问管理站静态资源。
  2. Nginx 将 `admin.bitbt.com/api/*` 反向代理到 Axum，浏览器请求同源、无跨域依赖。
  3. 部署脚本/流程生成 ≥24 字符的随机初始密码，写入 DB 的仅是密码哈希，不落明文到仓库或配置文件。
  4. 唯一可登录用户名为 `admin`；无自助注册。
- **依赖**: 无

### Spec-ID: ADM-02
- **标题**: 安全会话与登录防护
- **描述**: 管理 API 使用 HttpOnly Secure SameSite Cookie 会话；密码使用现代单向哈希；登录接口限流；全程 HTTPS；密钥与连接串仅来自环境变量。
- **验收标准**:
  1. 登录成功后下发会话 Cookie：`HttpOnly`、`Secure`、`SameSite=Strict`（或 `Lax` 若同站导航必需，须在实现备注中说明理由）。
  2. 密码使用 Argon2id 或 bcrypt（cost ≥ 12）存储；验证使用恒定时间比较路径。
  3. 登录失败不区分「用户不存在 / 密码错误」，统一 401。
  4. 登录限流：同一 IP（及可选同一用户名）在滑动窗口内超过阈值返回 429（建议默认：5 次 / 15 分钟，可配置）。
  5. 未认证访问管理 API（团队写操作、联系列表）返回 401。
  6. 登出使服务端会话失效且清除 Cookie。
  7. 代码与仓库中无硬编码 `DATABASE_URL`、SMTP、会话密钥、管理员密码等密钥；缺失必需环境变量时进程拒绝启动。
- **安全要求**:
  1. 会话 ID 使用 CSPRNG，不可预测。
  2. 会话有过期时间（建议 ≤ 12h，可配置）。
  3. Cookie 不携带在公开 `/api/team` 所需之外的敏感业务数据。
  4. 管理写接口需 CSRF 防护（SameSite Cookie + 同源部署即可满足 Phase 1；若使用非简单跨站场景须补 CSRF token）。
- **依赖**: ADM-01

### Spec-ID: ADM-03
- **标题**: 团队成员 CRUD + 排序
- **描述**: 认证后可对团队成员进行创建、读取、更新、删除，并调整展示顺序。字段：姓名、职位/角色、职责标签（列表）、排序权重；**不含**图片/Logo URL。Bryan 职位为 CCO，职责为 Business Development / Strategic Partnerships（中文站对应「商务拓展 / 战略合作」语义由公网站点 i18n 或 API 字段覆盖，见 ADM-05）。
- **验收标准**:
  1. `GET`（管理）返回全部成员，按 `sort_order` 升序。
  2. `POST` 创建成员；必填：name、role；tags 为字符串数组（可空）；默认追加到末尾排序。
  3. `PUT/PATCH` 更新 name、role、tags、sort_order。
  4. `DELETE` 删除成员；删除后公开列表不再包含该成员。
  5. 提供显式排序接口或批量更新 `sort_order`，公开页顺序与管理端一致。
  6. 校验：name/role 非空且长度有上限；tags 单项与数量有上限；非法输入返回 400。
  7. Phase 1 schema/API **不接受**头像、Logo、图片字段。
  8. 种子/迁移数据中 Bryan：`role = CCO`，tags 含 Business Development 与 Strategic Partnerships（或等价中英文对）。
- **依赖**: ADM-02

### Spec-ID: ADM-04
- **标题**: 联系表单只读分页列表
- **描述**: 管理端只读查看现有 `submissions` 表数据（由公开 `POST /api/contact` 写入），支持分页。
- **验收标准**:
  1. 认证后可分页列出 submissions：默认按创建时间倒序。
  2. 分页参数：`page`（≥1）、`page_size`（默认 20，最大 100）；响应含 `total`、`page`、`page_size`、`items`。
  3. 列表字段至少包含：role、name、title、company、contact、social、intro、created_at（若表有时间列；无则用主键序并在文档注明）。
  4. **无**创建/更新/删除 submissions 的管理接口。
  5. 未认证访问返回 401。
- **依赖**: ADM-02

### Spec-ID: ADM-05
- **标题**: 公开 Team API + 官网回退
- **描述**: 公开 `GET /api/team` 无需登录；现有 `TeamSection` 优先请求该 API，失败或空响应时回退到当前静态 i18n 成员列表。
- **验收标准**:
  1. `GET /api/team` 返回 JSON 数组（或 `{ items: [...] }`），按 `sort_order` 升序；每项含 id、name、role、tags、sort_order；**无**图片字段。
  2. 该接口无需 Cookie/鉴权；不返回管理员或 submissions 数据。
  3. `TeamSection` 在客户端/服务端请求 `/api/team`（或配置的公开 API 基址）；成功且非空则渲染 API 数据。
  4. 网络错误、非 2xx、或空列表时，回退到现有 `messages/*.json` 静态成员（含 Bryan CCO 职责文案）。
  5. 回退后页面布局与现有 initials 卡片样式保持可用（可用 name 首字母生成 initials）。
- **依赖**: ADM-03

---

## 明确不在 Phase 1
- 成员头像 / Logo / 图片上传
- 多管理员、RBAC、密码自助重置 UI
- submissions 编辑/导出/删除
- 管理站复杂设计系统重构

## 变更流程
任何 Spec 变更必须：
1. 提交变更申请
2. 重新进行 Spec Review
3. 更新此文档与 `05-implementation-plan.md`
