# 李嘉宏 · 个人站

一个零后端的静态个人站。首屏是**手写 WebGL2** 实时渲染的线框球体（没有 three.js / React），滚动叙事由 GSAP ScrollTrigger + Lenis 共用一条 RAF 完成。

- **框架**：Astro 7（静态输出，默认零 JS，仅首屏 3D 岛水合）
- **3D**：零依赖 WebGL2 + GPU 粒子层（约 5 KB gzip），按设备分级降采样 / 降 DPR，滚出首屏暂停渲染，WebGL 不可用时走内联 SVG 降级
- **动效**：GSAP + Lenis 单 RAF；`prefers-reduced-motion` 全量降级
- **样式**：Tailwind CSS v4 + 组件级 scoped CSS
- **部署**：GitHub Actions → GitHub Pages → CloudFront
- **交互**：⌘K / Ctrl+K 命令面板（跳转、项目、复制邮箱）、移动端菜单、滚动高亮
- **内容**：每个项目有程序化 SVG 封面；`/rss.xml`、JSON-LD、打印样式
- **质量**：Lighthouse CI 在每次部署后跑预算检查

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

**方案二：CloudFront 套在 GitHub Pages 前面（澳门/香港推荐）**

1. 仓库 **Settings → Variables → Actions** 新建变量 `SITE_URL=https://你的域名`。
   工作流会自动把 `BASE_PATH` 设为 `/`，canonical / OG / sitemap 也会用该域名。
2. CloudFront：
   - Origin 填 `<用户名>.github.io`，协议 HTTPS only，**不要**开启 “Forward Host header”。
   - **不要**给 GitHub Pages 配自定义域名、也不要放 `CNAME` 文件；否则 Pages 会 301 回你的域名，和 CloudFront 形成循环。
   - 自定义域名用 ACM 证书（必须签在 **us-east-1**），Cloudflare DNS 里 CNAME 到 CloudFront，**Proxy 必须关（灰云）**。
   - Price Class 选 All，确保走香港边缘节点。
3. **仓库形态**：
   - 用 `<用户名>.github.io` 仓库最省事，base 为 `/`，CloudFront 直接回源根路径。
   - 如果是普通项目仓库且设置了 `SITE_URL`（base `/`），要在 CloudFront Origin 里加 **Origin Path `/<仓库名>`**，否则根路径会 404。
4. 缓存策略：`/_astro/*` 长缓存；HTML 0–60 秒。部署后可用工作流自动 invalidation：
   仓库变量 `CLOUDFRONT_DISTRIBUTION_ID` + secrets `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`，`deploy.yml` 里已预留步骤。

> 澳门/香港：CloudFront 无本地节点，流量落到香港（HKG），到澳门 RTT 约 10–25ms，不需要 ICP，也不需要 CloudFront 中国区。大陆用户可访问但速度不保证。

## 结构

```
src/
  data/site.ts           # 全站内容收口
  layouts/Base.astro     # SEO / OG / JSON-LD / 全局脚本
  components/
    Hero.astro           # 首屏排版
    SphereGL.astro       # WebGL2 画布容器
    Work / About / Capabilities / Contact / Marquee / Nav / Footer / Cursor
  scripts/sphere-gl.ts   # 线框球体：几何、shader、分级与降级
  scripts/motion.ts      # Lenis + GSAP + 滚动揭示 + 阅读进度
  styles/global.css      # 设计令牌与基础样式
.github/workflows/deploy.yml
```

## 代码保护

前端代码最终一定会下发到浏览器，混淆只能提高复制成本，不能真正保密。本项目生产构建启用了较重的保护：

- 只处理自有脚本（SphereGL / Base / Cursor / Nav / Contact），跳过 GSAP 等第三方
- 开启：标识符重命名、RC4 字符串数组、控制流扁平化（0.5）、死代码注入（0.2）
- 关闭：selfDefending（实测会破坏加载）、debugProtection（会让 Lighthouse / DevTools 挂起）
- 粒子分布核心用 **AssemblyScript 编译成 WASM**（`sphere-core.wasm`），JS 侧只剩缓冲区和 WebGL 调用，加载失败自动回退 JS 版本
- 在 `renderChunk` 阶段执行，文件名 hash 与最终内容一致，**CloudFront / 浏览器缓存不会错版本**

```bash
npm run wasm:build      # 重新编译 WASM 核心
npm run build:protect   # 本地体验生产混淆
```

CI 里通过 `OBFUSCATE=1` 自动启用。注意：

- debugProtection 会在打开 DevTools 时周期性暂停页面，属于「恶心人」手段，绕过成本不高，也会影响正常调试
- WASM 只保护粒子分布逻辑；**GLSL 着色器仍然以字符串形式可见**，反调试也挡不住禁用 JS 或本地替换
- 想要更高一档，需要商业化 JSVMP / Jscrambler，代价是体积和运行开销
- 仓库本身是公开的；如果目标是隐藏源码，还是得转私有仓库 + 换托管

## 性能备注

- 首屏球体 + 粒子层：未混淆约 5 KB gzip，生产混淆后约 15 KB gzip；另加 14 KB WASM。零 three.js / React，两个 shader program、4 次 draw call（线框 + 点云 + 轨道 + 1.2 万粒子）；滚出视口自动停渲染，DPR 上限 1.5。
- 全站 JS：未混淆约 56 KB gzip，生产混淆后约 145 KB gzip（GSAP 27 + 动效 98 + 球体 15 + 其他），CSS 约 9 KB gzip。混淆带来的体积增长是安全换来的，运行时热路径仍在 GPU。
- 球体加载前由内联 SVG 线框球占位，WebGL2 不可用时直接保留它，不会出现空白。
- 字体内置于 npm 包（`@fontsource-variable/space-grotesk`），不依赖 Google Fonts，国内访问稳定。
- 全站无 Cookie、无第三方分析脚本；需要统计时建议接 Umami 或 Plausible。
