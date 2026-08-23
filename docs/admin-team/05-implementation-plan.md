# Implementation Plan — BitBT Admin Phase 1

> 实现开始前创建；完成后回填 Commit hash。所有 Task 初始状态为 `pending`。

## 概要

- **主任务**: admin-team
- **Spec Freeze**: docs/admin-team/03-spec-freeze.md
- **Spec 总数**: 5（ADM-01 … ADM-05）
- **Task 总数**: 5
- **Git 分支**: feature/admin-team
- **技术基线**: `backend/` Axum + PostgreSQL（已有 `submissions` / `POST /api/contact`）；官网 Next.js `TeamSection` 静态 i18n；管理前端静态资源 + Nginx 同域 `/api`

## Task 拆解

### Task-01: Schema、种子与管理员引导
- **Spec-ID**: ADM-01, ADM-03（种子字段）
- **描述**: 增加 `admins`、`sessions`、`team_members` 表（或等价迁移）；部署时创建 `admin` 用户（仅存密码哈希）；生成并打印一次强随机初始密码；种子团队成员含 Bryan（CCO；Business Development / Strategic Partnerships）；无图片列。
- **文件**:
  - `backend/migrations/*`（或部署 SQL）
  - `backend/src/`（bootstrap / seed 模块）
  - 部署脚本（如 `deploy/admin-bootstrap.sh` 或现有部署文档更新）
- **TDD 级别**: Standard（迁移/种子可测部分）；引导脚本 Lite
- **预估复杂度**: 中
- **状态**: completed
- **Commit**: —

### Task-02: 认证、会话 Cookie 与登录限流
- **Spec-ID**: ADM-02
- **描述**: 实现 `POST /api/admin/login`、`POST /api/admin/logout`、会话中间件；Argon2id/bcrypt 校验；HttpOnly Secure SameSite Cookie；登录 IP 限流；必需密钥仅从环境变量读取，缺失则启动失败；收紧管理 API CORS（同源）。
- **文件**:
  - `backend/src/auth.rs`（或等价模块）
  - `backend/src/rate_limit.rs`
  - `backend/src/main.rs`（路由挂载）
  - `backend/Cargo.toml`（argon2/bcrypt、cookie、tower 等依赖）
  - 认证相关单元/集成测试
- **TDD 级别**: Full（安全路径强制 Full）
- **预估复杂度**: 高
- **状态**: completed
- **Commit**: —

### Task-03: 管理端 Team CRUD + 排序 API
- **Spec-ID**: ADM-03
- **描述**: 认证保护下的团队成员 list/create/update/delete 与排序；输入校验；拒绝图片字段；公开只读 `GET /api/team` 可先在本 Task 落地最小实现以便联调。
- **文件**:
  - `backend/src/team.rs`
  - `backend/src/main.rs`
  - `backend` 集成测试（CRUD、排序、鉴权 401）
- **TDD 级别**: Standard
- **预估复杂度**: 中
- **状态**: completed
- **Commit**: —

### Task-04: Submissions 只读分页 + 管理静态前端
- **Spec-ID**: ADM-01, ADM-04
- **描述**: `GET /api/admin/submissions?page&page_size` 只读分页；管理站静态 SPA/多页：登录、团队 CRUD+排序 UI、联系列表分页；Nginx 站点配置（`admin.bitbt.com` 静态根 + `/api` 反代）；无图片上传控件。
- **文件**:
  - `backend/src/submissions.rs`（或 admin 模块）
  - `admin/`（新建静态前端目录：HTML/JS/CSS 或轻量构建产物）
  - Nginx 配置片段 / 部署说明
- **TDD 级别**: Standard（API）；Lite（静态 UI / Nginx）
- **预估复杂度**: 中
- **状态**: completed
- **Commit**: —

### Task-05: 官网 TeamSection 拉取 API + 静态回退
- **Spec-ID**: ADM-05
- **描述**: `TeamSection` 请求公开 `GET /api/team`；成功非空则渲染 API 数据（initials 由 name 推导）；失败/空则回退现有 `messages` 静态列表；确认 Bryan 静态文案仍为 CCO + BD/战略合作职责。
- **文件**:
  - `src/components/TeamSection.tsx`
  - 必要时 `next.config.ts` / 环境变量（公开 API 基址）
  - 可选轻量前端测试或手动验收清单
- **TDD 级别**: Lite（UI 回退路径）；若抽纯函数解析则 Standard
- **预估复杂度**: 低
- **状态**: completed
- **Commit**: —

### Security hardening (post Task-05 review)
- **描述**: 修复安全/代码评审 HIGH/MEDIUM：联系表单校验与异步 SMTP、登录限流与 X-Real-IP、会话吊销、bootstrap 随机密码、Origin/`Cache-Control`、submissions 初始迁移、TeamSection 空列表回退、Nginx/api 部署文档。
- **状态**: completed
- **Commit**: —

## Task 依赖关系

```
Task-01 (schema / seed / admin bootstrap)
  |
  +-- Task-02 (auth / session / rate limit)
        |
        +-- Task-03 (team CRUD + GET /api/team)
        |     |
        |     +-- Task-05 (TeamSection fetch + fallback)  [可与 Task-04 尾部并行]
        |
        +-- Task-04 (submissions list + admin UI + Nginx)
```

## 风险项

| 风险 | 影响 | 应对 |
|------|------|------|
| 现有 `main.rs` 默认 `DATABASE_URL` 明文回退 | 违背「无硬编码密钥」 | Task-02 改为必填 env，删除不安全默认值 |
| 公网 CORS `Any` 与 Cookie 会话冲突 | 会话泄露或 Cookie 不生效 | 管理站同源反代；收紧 CORS |
| 生产 `submissions` 无 `created_at` | 分页排序语义不清 | Task-01 迁移补列或明确用 `id` DESC |
| 官网与 admin API 不同域 | 破坏同域 Cookie / 增加 CORS | Phase 1 强制 admin 同域 `/api`；官网 `/api/team` 走已有公开 API 入口 |

## 建议实现顺序
1. Task-01 → Task-02 → Task-03 → Task-04 → Task-05  
2. 每 Task 一提交；安全相关（Task-02）不得降为 Lite TDD。
