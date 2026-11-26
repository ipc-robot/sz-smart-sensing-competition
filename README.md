# 深圳市智能感知与自主系统设计竞赛

深圳市智能感知与自主系统设计竞赛官方网站与在线报名/作品上传系统，采用零构建前端（HTML5 + CSS3 + 原生 JavaScript）与零依赖 Node.js 后端（内置 `node:sqlite` + 流式上传），通过本地 Caddy 与 FRP 穿透向外提供稳定服务。

- **主办单位**：深圳市仪器仪表学会
- **发起单位**：深圳大学、中山大学、深圳技术大学
- **三大赛题**：柔性电子、具身智能机器人、开源鸿蒙 / RISC-V

## 访问入口

- **GitHub Pages 展示页**：`https://ipc-robot.github.io/sz-smart-sensing-competition/`
- **在线报名与作品上传入口（FRP）**：`http://106.53.200.120:38000/apps/sz-competition/`
- **组委会作品管理后台（FRP）**：`http://106.53.200.120:38000/apps/sz-competition/admin`

> 说明：由于 GitHub Pages 为 HTTPS，而当前 FRP 入口为 HTTP，浏览器会拦截 HTTPS 页面向 HTTP 接口的异步直传请求。因此 GitHub Pages 会自动引导参赛者点击进入统一上传入口 `http://106.53.200.120:38000/apps/sz-competition/#registration`；若日后为 `frps` 配置了 HTTPS 域名，只需在 [script.js](./script.js) 中填写 `HTTPS_API_BASE` 即可实现在 GitHub Pages 页内直接上传。

## 目录结构

```text
sz-smart-sensing-competition/
├── index.html          # 页面主体结构、赛事文案与在线报名表单
├── style.css           # 样式表（OKLCH 色彩体系与响应式布局）
├── script.js           # 导航联动、倒计时、海报预览与流式上传逻辑
├── assets/
│   └── poster.jpg      # 官方宣传海报
├── server/
│   ├── index.mjs       # 零依赖 Node.js 后端（流式上传、SQLite、管理接口）
│   ├── admin.html      # 组委会作品管理后台页面
│   └── .env            # 本地环境变量与 ADMIN_PASSWORD（已 gitignore）
├── data/               # SQLite 数据库与上传文件存储目录（已 gitignore）
├── .nojekyll           # 禁用 Jekyll 构建
├── .gitignore
└── README.md
```

## 服务运维

后端由 systemd 用户服务托管（监听 `127.0.0.1:38140`，经 `/data/research/server/routes/sz-competition.caddy` 统一挂载至 `/apps/sz-competition/`）：

```bash
systemctl --user status sz-competition
systemctl --user restart sz-competition
journalctl --user -u sz-competition -n 50 --no-pager
```

管理后台密码保存在 `server/.env` 的 `ADMIN_PASSWORD` 字段中，切勿提交到 Git 仓库。
