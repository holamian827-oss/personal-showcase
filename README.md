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

- `email`：`hello@lijiahong.dev` → 你的真实邮箱
- `socials`：GitHub 链接目前是 `https://github.com/`
- `projects[].href`：留空则不显示为链接；填真实项目地址后自动变成可点行

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

### 自定义域名

在仓库 Settings → Pages 填域名，并在 `public/` 下放一个 `CNAME` 文件（内容为域名）。同时把工作流里的 `SITE_URL` 改成你的域名，否则 canonical 和 sitemap 仍是 github.io。

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

- 3D 与 React 运行时是一个按需水合的独立 chunk（约 1.1 MB 未压缩 / ~300 KB gzip）。想要更极致的首屏，可以在 `SphereScene` 外层加 `requestIdleCallback` 延迟挂载，或换成一个手写 WebGL 场景。
- 字体内置于 npm 包（`@fontsource-variable/space-grotesk`），不依赖 Google Fonts，国内访问稳定。
- 全站无 Cookie、无第三方分析脚本；需要统计时建议接 Umami 或 Plausible。
