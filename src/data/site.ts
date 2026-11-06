/**
 * 全站内容唯一收口。
 * 改姓名、项目、链接、技能，只改这个文件，组件不用动。
 * 带 TODO 的字段记得替换成你自己的真实信息。
 */
export const site = {
  name: '李嘉宏',
  nameEn: 'LI JIAHONG',
  role: '全栈开发者 / 安全研究者',
  location: '中国 · 远程',
  availability: '可接合作',

  // 首屏一句话
  headline: ['把复杂做简单，', '把简单做狠。'],
  intro:
    '我写代码，也拆代码。关注 Web 架构、Cloudflare 生态与移动端逆向。喜欢用最少的依赖做出最快的页面，也喜欢把一个系统从里到外看透。',

  // TODO: 换成你的真实邮箱与主页
  email: 'holamian827@gmail.com',
  socials: [{ label: 'Email', href: 'mailto:holamian827@gmail.com' }],

  facts: [
    { k: 'Based', v: '中国 · 远程' },
    { k: 'Focus', v: 'Web / Infra / Security' },
    { k: 'Status', v: '可接合作' },
  ],

  // 3–5 个就够，写清楚“你做了什么、结果是什么”
  projects: [
    {
      index: '01',
      title: 'Cloud Mail',
      subtitle: 'Workers 原生邮件服务',
      year: '2026',
      description:
        '基于 Cloudflare Workers 的邮件收发服务。重做磨砂玻璃界面，修复阻塞性缺陷，并在免费版 CPU 预算内完成安全加固。',
      tags: ['Cloudflare Workers', 'UI 重构', '安全加固'],
      href: '',
      linkLabel: '查看项目',
    },
    {
      index: '02',
      title: 'Eye Detector',
      subtitle: '浏览器端眼部疾病识别',
      year: '2026',
      description:
        '把 ONNX 模型放进浏览器：图片不上传、不落盘，本地推理即出结果。静态托管，打开即用。',
      tags: ['ONNX Runtime Web', '隐私优先', '静态部署'],
      href: '',
      linkLabel: '查看项目',
    },
    {
      index: '03',
      title: 'This Site',
      subtitle: '你正在看的这个页面',
      year: '2026',
      description:
        'Astro 静态输出 + React Three Fiber 线框球体 + GSAP/Lenis 单 RAF 滚动叙事。零后端，GitHub Pages 直接跑。',
      tags: ['Astro', 'React Three Fiber', 'GSAP'],
      href: '',
      linkLabel: '看源码',
    },
  ],

  capabilities: [
    {
      title: '前端',
      note: 'Frontend',
      items: ['Astro', 'React / TypeScript', 'Tailwind CSS', 'Three.js / R3F', 'GSAP / Lenis'],
    },
    {
      title: '后端与基础设施',
      note: 'Infra',
      items: ['Cloudflare Workers', 'Node.js', 'Python', 'SQL', 'GitHub Actions'],
    },
    {
      title: '安全',
      note: 'Security',
      items: ['Android 逆向', '流量分析', '加固评估', 'Frida', '代码审计'],
    },
    {
      title: '工具',
      note: 'Tooling',
      items: ['Vite', 'Git', 'Docker', 'JADX', 'Linux'],
    },
  ],

  now: [
    { label: '正在做', text: 'Cloud Mail 的界面与安全收口' },
    { label: '正在学', text: 'WebGL 着色器与实时渲染性能' },
    { label: '正在找', text: '有趣的远程合作与安全项目' },
  ],
} as const;
