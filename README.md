# 李嘉宏 · 个人站

一个零后端的静态个人站。首屏是 React Three Fiber 实时渲染的线框球体，滚动叙事由 GSAP ScrollTrigger + Lenis 共用一条 RAF 完成。

- **框架**：Astro 7（静态输出，默认零 JS，仅首屏 3D 岛水合）
- **3D**：Three.js + React Three Fiber，按设备分级降采样 / 降 DPR，WebGL 不可用时走 CSS 降级
- **动效**：GSAP + Lenis 单 RAF；`prefers-reduced-motion` 全量降级
- **样式**：Tailwind CSS v4 + 组件级 scoped CSS
- **部署**：GitHub Actions → GitHub Pages

## 本地开发

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # 产物在 dist/
npm run preview
```

## 改内容（只改一个文件）

所有文案、项目、技能、链接都在 `src/data/site.ts`，组件不用动。

**上线前必须替换的占位符：**

- `email`：当前为 `holamian827@gmail.com`
- `projects[].href`：留空则不显示为链接；填真实项目地址后自动变成可点行

分享图 `public/og.png` 与图标 `public/favicon.ico` 已生成；改了名字/标语后可用 `scripts/og.html`、`scripts/favicon.html` 重新截图替换。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库并推送：

   ```bash
   git init
   git add .
   git commit -m "init portfolio"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

2. 打开仓库 **Settings → Pages → Build and deployment → Source**，选 **GitHub Actions**。

3. 之后每次 push 到 `main` 都会自动构建发布。工作流会自己判断：

   - 仓库名是 `<用户名>.github.io` → `BASE_PATH=/`
   - 普通仓库 → `BASE_PATH=/<仓库名>`

   不需要手动改配置。

### 自定义域名 / CloudFront

**方案一：直接用 GitHub Pages 自定义域名**

在仓库 Settings → Pages 填域名，并在 `public/` 下放一个 `CNAME` 文件（内容为域名）。

**方案二：CloudFront 套在 GitHub Pages 前面（推荐，可加缓存与自定义域名）**

1. 仓库 **Settings → Variables → Actions** 新建变量 `SITE_URL=https://你的域名`。
   工作流会自动把 `BASE_PATH` 设为 `/`（即使仓库是项目仓库），canonical / OG / sitemap 也会用该域名。
2. CloudFront：
   - Origin 填 `<用户名>.github.io`，协议 HTTPS only。
   - **不要**开启 “Forward Host header”；否则 GitHub Pages 会 301 回自定义域名，形成循环。
   - 自定义域名用 ACM 证书（证书必须签在 **us-east-1**），DNS 把域名 CNAME / Alias 到 CloudFront。
3. 缓存策略：`/_astro/*` 长缓存（文件名自带 hash），HTML 用 0–60 秒；每次部署后对 `/*` 做一次 invalidation。
4. 不要在 GitHub Pages 里再填同一个自定义域名，CloudFront 与 Pages 二选一作为对外入口。

> 注意：CloudFront 全球边缘节点**不含中国大陆**。面向大陆用户时，回源和边缘通常在 HK/东京/新加坡，加速有限；如需大陆加速，要使用 CloudFront 中国区（需 ICP 备案）或国内 CDN。

## 结构

```
src/
  data/site.ts           # 全站内容收口
  layouts/Base.astro     # SEO / OG / JSON-LD / 全局脚本
  components/
    Hero.astro           # 首屏排版
    three/SphereScene.tsx# 线框球体（含设备分级与降级）
    Work / About / Capabilities / Contact / Marquee / Nav / Footer / Cursor
  scripts/motion.ts      # Lenis + GSAP + 滚动揭示 + 阅读进度
  styles/global.css      # 设计令牌与基础样式
.github/workflows/deploy.yml
```

## 性能备注

- 3D 与 React 运行时是独立 chunk（约 1.1 MB 未压缩 / ~300 KB gzip），首屏直接水合；水合前由同构的内联 SVG 线框球占位，不会出现空白。想更极致可以延迟挂载或改手写 WebGL。
- 字体内置于 npm 包（`@fontsource-variable/space-grotesk`），不依赖 Google Fonts，国内访问稳定。
- 全站无 Cookie、无第三方分析脚本；需要统计时建议接 Umami 或 Plausible。
