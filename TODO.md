# CourtSync 剩余待办 (TODO)

> 最后更新：2026-09-03
> 状态基线：`main` 已收敛为唯一规范分支，`86a2e70`（P1 写入削减 + P2 真实投递）已部署，cron 已暂停。

---

## 🔴 P0 — 恢复数据源（最高优先级，阻塞真实数据）

> 只有修好数据源后才能重新开启 cron。当前两个源均长期失败，`/api/slots` 返回 `count:0`。

### USThing — Azure AD 凭据失效（自 2026-06-19 起）
- **症状**：每次同步报 `AADSTS50126` / `invalid_grant`（Error validating credentials）
- **修复**：更新 `USTHING_PASSWORD` secret（Azure AD 凭据过期）
  - 上传方式：`npx wrangler secret put USTHING_PASSWORD`
  - 也需同步本地 `.dev.vars`（已备份在 main 树根目录，gitignored）
- 验证：`/api/slots` 恢复 `count > 0`，`source_health` 显示 usthing 正常

### Jiushi — 阿里云 ESA WAF 403（自 2026-07-29 起）
- **症状**：HTTP 403 WAF 拦截（`Denied by http_custom`）
- **修复**：代理 / 反爬策略二选一
  - 配置 `JIUSHI_PROXY_URL`（Worker 出口 IP 被 WAF 封，需代理转发）
  - 或改用本地 Go CLI 同步 Jiushi，再写入 D1
- 注意：AGENTS.md 明确「WAF 拦截要早退，不要重试所有日期」

---

## 🟡 P1 — 生产恢复前可选的加固

- [x] ~~`persistSlots` 条件 upsert~~（已完成 `86a2e70`）
- [x] ~~30 天 retention 清理~~（已完成 `86a2e70` + 迁移 `0009_kv_meta`）
- [ ] 恢复 cron 定时同步：数据源修好后，把 `wrangler.jsonc` 里 `"triggers"` 中暂停注释的
      `"crons": ["*/5 0-14 * * *"]` 恢复，然后 `npm run deploy`

---

## 🟢 P2 — 功能修复

- [x] ~~真实 PushDeer 投递（队列消费者）~~（已完成 `86a2e70`，1062 条滞留 outbox 已清空）
- [x] ~~Better Auth `/api/auth/*` 路由 404~~（**已确认修复**）
  - 生产验证 `2026-09-03`：`sports.anserlabs.com/api/auth/get-session` → 200、
    `/api/auth/sign-in/social` → 返回 Google OAuth URL、`/callback/google` → 302
    （better-auth 正常处理，不再落入 Hono `notFound`/SPA fallback）
  - 回归测试：`test/worker/auth-routing.test.ts`（真实 better-auth + D1，无 stub）
  - ⚠️ 遗留：登录页只在 `sports.anserlabs.com` 可用；`anserlabs.com`(apex) 返回 522
    （Worker 未绑定 apex，且 APP_BASE_URL 是 sports.anserlabs.com）
- [x] ~~PATCH /api/rules/:id 500（zod v4 `.partial()` 在 refine 上抛异常）~~（已修复）
  - 新增 `rulePatchSchema`（无 default 的纯 optional schema）+ `RuleService.update`
    合并后校验 facility/source；回归测试 `rules-patch-route.test.ts` / `rule-schema.test.ts`
- [x] ~~channel 投递失败无反馈~~（已修复）
  - 队列消费失败时写 `notification_channel.last_error` + 24h 失败计数；成功时清除；
    设置页展示最近失败原因

## ⚪ 收尾 / 可选

- [ ] 轮换任何已暴露的 secret：旧 `wrangler.toml` 中的 3 个 `PUSHDEER_KEYS` 仍留在
      **公开 git 历史**里（GitHub 仓库为 public），需在 PushDeer 后台作废并重新生成
      （参考 `docs/superpowers/plans/2026-06-09-rule-notifications-phase-1-foundation-auth.md`）
- [ ] `ADMIN_EMAILS` 邮箱种子验证流程走通（pending → active）
- [ ] retention 首次自动运行验证（cron 恢复后的第一个周期应删除超期行）

---

## 🔑 常用运维命令

```bash
# 部署（仅 main 树，部署守卫会拦截 worktree）
npm run deploy

# 手动触发一次同步（本地）
npx wrangler dev --test-scheduled

# Worker 测试
npx vitest run --config vitest.config.ts

# Web 测试
npx vitest run --config vitest.web.config.ts

# 类型检查 / 构建
npm run typecheck
npm run build
```