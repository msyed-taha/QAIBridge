import { useEffect } from 'react';

/**
 * Makes every element marked `data-tilt` lean toward the mouse pointer, and
 * moves the soft light on `.glass-card`s to where the pointer is. One listener
 * for the whole site, so cards only need the attribute. `data-tilt="2"` sets
 * the most it tilts, in degrees (default 5). Styles live in index.css.
 * Off on touch screens and for "reduce motion".
 */
export function TiltCards() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let card: HTMLElement | null = null, frame = 0, x = 0, y = 0;

    const release = (el: HTMLElement) => {
      el.classList.remove('is-tilting');
      for (const v of ['--rx', '--ry']) el.style.removeProperty(v);
    };
    const apply = () => {
      frame = 0;
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = clamp((x - r.left) / r.width), py = clamp((y - r.top) / r.height); // 0…1 across the card
      const max = Number(card.dataset.tilt) || 5;
      card.style.setProperty('--rx', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      card.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    };
    const onMove = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tilt]') : null;
      if (el !== card) {
        if (card) release(card);
        card = el;
        card?.classList.add('is-tilting');
      }
      x = e.clientX; y = e.clientY;
      if (card && !frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => { if (card) release(card); card = null; };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      onLeave();
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, []);

  return null;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
