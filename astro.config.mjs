// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

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
    plugins: [tailwindcss()],
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
