# 2048 · DON'T PANIC 42

一个部署在 Cloudflare Workers 上的个人项目首页和手机端 2048 小游戏。

## 路由

- `/`：DON'T PANIC 42 个人数字实验室首页
- `/2048/`：手机端 2048 游戏
- `/minesweeper/`：支持三档难度的手机端扫雷游戏
- `/wechat`：微信公众号验证与自动回复接口

## 功能

- 手指上下左右滑动，桌面端也支持方向键
- 实时分数与本机最佳成绩
- 自动保存当前局面，刷新页面可以继续
- 可选用户名/密码注册登录，登录后将每局成绩保存至 Cloudflare D1
- 跨设备同步云端最佳成绩，并保留游客本机存档
- 胜利和无路可走状态提示
- 保留已有的微信公众号 `/wechat` 验证与自动回复接口
- 响应式布局，适配窄屏、刘海屏和横向空间有限的设备
- 扫雷提供初级（9×9/10 雷）、中级（16×16/40 雷）、高级（16×30/99 雷）
- 扫雷支持首次点击安全、长按或插旗模式、计时与分难度本机最佳记录

## 本地运行

安装依赖后运行：

```bash
npm install
npm run dev
```

也可以直接用任意静态服务器打开 `dist/` 目录，游戏本身不依赖后端。

## 测试

```bash
npm test
npm run check
```

## 部署到 Cloudflare

1. 在 Cloudflare Worker 中将 `WECHAT_TOKEN` 配置为加密的 Secret。不要把实际值写入仓库。
2. 确认 `wrangler.jsonc` 中的 Worker 名称 `dontpanic42-site` 与现有服务一致。
3. 登录 Wrangler 后执行：

```bash
npm run deploy
```

首页和游戏由 Assets 提供；`/wechat` 与 `/api/*` 会先进入 Worker。配置中保留了现有 `DB` → `dontpanic42-db` 的 D1 绑定。认证接口首次请求时会幂等创建带游戏命名空间的 `game_users`、`game_sessions` 和 `game_scores` 表，避免与数据库原有业务表冲突；相同结构也保存在 `migrations/0001_auth_and_scores.sql`，便于审查和手动迁移。部署前请确认 `dontpanic42.top` 的自定义域名仍绑定到 `dontpanic42-site`。

仓库已连接 Cloudflare Workers Builds；向 `main` 分支推送提交会自动触发生产部署。

## 凭证安全

仓库不包含 Token、账号或密钥。`WECHAT_TOKEN` 只从 Cloudflare 的运行时 Secret `env.WECHAT_TOKEN` 读取，并用于校验微信请求签名。

用户密码不会明文存储：Worker 使用随机盐和 PBKDF2-SHA-256 派生密码摘要。登录会话使用 256 位随机令牌，浏览器仅通过 `Secure`、`HttpOnly`、`SameSite=Lax` Cookie 持有原始令牌，D1 只保存令牌的 SHA-256 摘要。会话有效期为 30 天，退出登录会立即删除对应会话。
