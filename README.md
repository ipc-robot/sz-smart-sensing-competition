# 深圳市智能感知与自主系统设计竞赛

深圳市智能感知与自主系统设计竞赛官方网站静态源码，采用零构建纯静态方案（HTML5 + CSS3 + 原生 JavaScript），可直接部署至 GitHub Pages。

- **主办单位**：深圳市仪器仪表学会
- **发起单位**：深圳大学、中山大学、深圳技术大学
- **三大赛题**：柔性电子、具身智能机器人、开源鸿蒙 / RISC-V

## 目录结构

```text
sz-smart-sensing-competition/
├── index.html          # 页面主体结构与赛事文案
├── style.css           # 样式表（OKLCH 色彩体系与响应式布局）
├── script.js           # 导航联动、倒计时、赛程高亮、海报大图预览
├── assets/
│   └── poster.jpg      # 官方宣传海报（自选题指南文档提取）
├── .nojekyll           # 禁用 Jekyll 构建，确保静态资源原样托管
├── .gitignore
└── README.md
```

## 本地预览

在项目根目录执行：

```bash
python3 -m http.server 8080
```

随后在浏览器访问 `http://localhost:8080`。

## 后续内容补充指南

原始选题指南中 **三、报名方式** 与 **五、赛题咨询** 为空，当前页面中已以“即将公布 / 待更新”清晰占位。确定信息后可按以下方式更新 [index.html](./index.html)：

1. **补充报名方式**：在 `#registration` 区块的“三、报名方式”卡片内，替换 `.pending-box` 与列表项中的“待组委会补充更新”，添加报名问卷链接、投稿邮箱或附件下载链接。
2. **补充赛题咨询与二维码**：将微信群、公众号二维码图片放入 `assets/` 目录（如 `assets/group-qr.png`、`assets/wechat-qr.png`），在“五、赛题咨询”卡片的 `.qr-placeholder-grid` 中替换为 `<img>` 标签并补充联系人邮箱与电话。

## 发布到 GitHub Pages

1. 在 GitHub 上新建公开仓库（例如 `sz-smart-sensing-competition`）。
2. 在本目录关联远程仓库并推送：

```bash
git remote add origin https://github.com/<你的用户名>/<你的仓库名>.git
git push -u origin main
```

3. 打开仓库的 **Settings → Pages**：
   - **Source** 选择 **Deploy from a branch**
   - **Branch** 选择 `main` / `/ (root)` 并保存
4. 等待约 1 分钟后即可通过 `https://<你的用户名>.github.io/<你的仓库名>/` 访问。
