# 2048 · DON'T PANIC 42

一个部署在 Cloudflare Workers 上的个人项目首页和手机端 2048 小游戏。

## 路由

- `/`：DON'T PANIC 42 个人数字实验室首页
- `/2048/`：手机端 2048 游戏
- `/wechat`：微信公众号验证与自动回复接口

## 功能

- 手指上下左右滑动，桌面端也支持方向键
- 实时分数与本机最佳成绩
- 自动保存当前局面，刷新页面可以继续
- 胜利和无路可走状态提示
- 保留已有的微信公众号 `/wechat` 验证与自动回复接口
- 响应式布局，适配窄屏、刘海屏和横向空间有限的设备

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

首页和游戏由 Assets 提供；只有 `/wechat` 会先进入 Worker。配置中同时保留了现有 `DB` → `dontpanic42-db` 的 D1 绑定。部署前请确认 `dontpanic42.top` 的自定义域名仍绑定到 `dontpanic42-site`。

仓库已连接 Cloudflare Workers Builds；向 `main` 分支推送提交会自动触发生产部署。

## 凭证安全

仓库不包含 Token、账号或密钥。`WECHAT_TOKEN` 只从 Cloudflare 的运行时 Secret `env.WECHAT_TOKEN` 读取，并用于校验微信请求签名。
