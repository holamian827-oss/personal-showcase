/** 统一处理 GitHub Pages 的 base 前缀（用户主页仓库为 '/', 项目仓库为 '/repo/'）。 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const url = (path = '/') => {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}` || '/';
};

export const anchor = (hash: string) => `${base}/${hash}`;
