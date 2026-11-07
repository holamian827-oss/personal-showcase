import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { site } from '../data/site';

export function GET(context: APIContext) {
  const base = context.site ?? new URL('https://example.com');
  const workUrl = new URL(`${import.meta.env.BASE_URL}#work`, base).href;

  return rss({
    title: `${site.name} · 作品`,
    description: site.intro,
    site: base,
    customData: '<language>zh-cn</language>',
    items: site.projects.map((project) => ({
      title: project.title,
      description: project.description,
      link: project.href || workUrl,
      pubDate: new Date(`${project.year}-01-01T00:00:00Z`),
      categories: [...project.tags],
    })),
  });
}
