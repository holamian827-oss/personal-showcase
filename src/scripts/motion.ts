import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

let lenis: Lenis | undefined;

if (!reduced) {
  lenis = new Lenis({
    autoRaf: false,
    lerp: 0.09,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
    syncTouch: false,
  });

  // 关键：GSAP 与 Lenis 共用一个 RAF 循环。
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* 站内锚点交给 Lenis，保留原生行为作为降级 */
document.addEventListener(
  'click',
  (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href*="#"]');
    if (!link || !lenis) return;

    const target = new URL(link.href, location.href);
    if (target.pathname !== location.pathname || !target.hash) return;

    const el = document.querySelector<HTMLElement>(target.hash);
    if (!el) return;

    event.preventDefault();
    lenis.scrollTo(el, { duration: 1.15 });
    history.pushState(null, '', target.hash);
  },
  { passive: false },
);

/* 滚动揭示：成批进入视口的元素做轻微错位 */
if (!reduced) {
  document.documentElement.classList.add('reveal-ready');

  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        stagger: 0.08,
        ease: 'power3.out',
        overwrite: true,
      }),
  });

  // 顶部标题做细微视差，强化“滚动是连续的”感受
  gsap.to('.hero__stage', {
    yPercent: 12,
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  });
}

/* 首屏跟随鼠标的柔光（桌面端） */
if (!reduced && finePointer) {
  const hero = document.querySelector<HTMLElement>('.hero');
  const spot = hero?.querySelector<HTMLElement>('[data-spot]');

  if (hero && spot) {
    let raf = 0;

    window.addEventListener(
      'pointermove',
      (event) => {
        if (raf) return;
        const { clientX, clientY } = event;

        raf = requestAnimationFrame(() => {
          const rect = hero.getBoundingClientRect();
          const x = clientX - rect.left;
          const y = clientY - rect.top;

          if (y >= 0 && y <= rect.height) {
            hero.style.setProperty('--mx', `${x}px`);
            hero.style.setProperty('--my', `${y}px`);
            spot.classList.add('is-on');
          } else {
            spot.classList.remove('is-on');
          }

          raf = 0;
        });
      },
      { passive: true },
    );
  }
}

/* 磁吸：只给主按钮一点点“手感”，桌面端生效 */
if (!reduced && finePointer) {
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3.out' });

    el.addEventListener(
      'pointermove',
      (event) => {
        const rect = el.getBoundingClientRect();
        xTo((event.clientX - (rect.left + rect.width / 2)) * 0.16);
        yTo((event.clientY - (rect.top + rect.height / 2)) * 0.22);
      },
      { passive: true },
    );

    el.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  });
}

/* 顶部阅读进度 */
const progress = document.querySelector<HTMLElement>('[data-progress]');
const updateProgress = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
  if (progress) progress.style.transform = `scaleX(${ratio})`;
};

window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress);
updateProgress();

/* 字体/图片加载完成后重新测量，避免 ScrollTrigger 起点偏移 */
window.addEventListener('load', () => ScrollTrigger.refresh());
document.fonts?.ready.then(() => ScrollTrigger.refresh());

export { lenis };
