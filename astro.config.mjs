// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import JavaScriptObfuscator from 'javascript-obfuscator';

/**
 * 只在生产构建（OBFUSCATE=1）时混淆自有脚本。
 * 用 renderChunk 在 hash 计算之前改写内容，保证文件名 hash 与内容一致，
 * 不会破坏 CloudFront / 浏览器缓存。
 */
function protectScripts() {
  return {
    name: 'protect-scripts',
    apply: 'build',
    enforce: 'post',
    renderChunk(code, chunk) {
      // 只处理浏览器端自有脚本，跳过 GSAP 等第三方 chunk
      if (!chunk.fileName.startsWith('_astro/')) return null;
      if (!/^(SphereGL|Base|Cursor|Nav|Contact)\./.test(chunk.fileName.slice(7))) return null;
      const result = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.2,
        debugProtection: false,
        selfDefending: false,
        simplify: true,
        renameGlobals: false,
        identifierNamesGenerator: 'hexadecimal',
        stringArray: true,
        stringArrayThreshold: 0.75,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayEncoding: ['rc4'],
        stringArrayIndexShift: true,
        splitStrings: false,
        numbersToExpressions: true,
        transformObjectKeys: false,
        unicodeEscapeSequence: false,
        reservedStrings: ['\\.js$', '^/', '^_astro', '^https?://', '^#', '^data:'],
        reservedNames: ['^__'],
        target: 'browser',
        sourceMap: false,
        log: false,
      });
      return { code: result.getObfuscatedCode(), map: null };
    },
  };
}

// 部署时由 GitHub Actions 注入；本地默认按“用户主页仓库”处理。
// 如果仓库名是 <用户名>.github.io，BASE_PATH 用 '/'；
// 如果是普通项目仓库，BASE_PATH 用 '/<仓库名>'。
const site = process.env.SITE_URL || 'https://lijiahong.github.io';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss(), ...(process.env.OBFUSCATE === '1' ? [protectScripts()] : [])],
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
