import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Signed-in tool pages (the protected and admin routes in App.tsx) and the
// lessons, where the backdrop goes calm so results and games are easy to follow.
const CALM_PAGES = /^\/(app|account|simulator|circuit|solve|dashboard|module\d|admin)(\/|$)|^\/learn\/[^/]/;

// Stars at random-looking but fixed spots (seeded), drawn once as a large SVG
// tile so no repeating pattern shows.
function starTile(seed: number, w: number, h: number, count: number) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const colours = ['#fff', '#fff', '#fff', '#00ffcc', '#cc44ff'];
  let dots = '';
  for (let i = 0; i < count; i++) {
    const r = rand() < 0.15 ? 1.1 : 0.7;
    dots += `<circle cx="${(rand() * w).toFixed(1)}" cy="${(rand() * h).toFixed(1)}" r="${r}" `
          + `fill="${colours[Math.floor(rand() * colours.length)]}" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${dots}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const STARS = starTile(7, 1600, 1000, 90);
const STARS_TWINKLE = starTile(23, 1150, 900, 40);

/**
 * The backdrop behind every page: teal and purple glows that drift, a star field
 * with the odd shooting star, and a grid floor running off to a glowing horizon.
 * On arrival the scene builds itself (glows bloom, the floor sweeps open, the
 * horizon draws in). With a mouse, the layers shift by different amounts so the
 * scene feels 3D, and a soft light follows the pointer. Inside the signed-in app
 * it goes calm: everything holds still and dims (fading over a second when you
 * move between the two). Styles live in index.css (.scene-*). Motion stops for
 * "reduce motion" and pauses while the tab is hidden.
 */
export function AppBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const calm = CALM_PAGES.test(useLocation().pathname);

  // Set as a class toggle rather than through className, which would wipe the
  // is-paused / has-pointer classes the effect below manages. Applied before
  // paint, so a page opened directly inside the app starts calm.
  useLayoutEffect(() => { ref.current?.classList.toggle('is-calm', calm); }, [calm]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onVisibility = () => el.classList.toggle('is-paused', document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    // Parallax: mouse position as -1…1 in --mx / --my, at most once per frame.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasMouse = window.matchMedia('(pointer: fine)').matches;
    let x = 0, y = 0, frame = 0;
    const apply = () => {
      frame = 0;
      el.classList.add('has-pointer');
      el.style.setProperty('--mx', x.toFixed(3));
      el.style.setProperty('--my', y.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (el.classList.contains('is-calm')) return;
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    if (!still && hasMouse) window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="scene" aria-hidden="true">
      <div className="scene-layer scene-depth-far">
        <div className="scene-stars" style={{ backgroundImage: STARS }} />
        <div className="scene-stars scene-stars-twinkle" style={{ backgroundImage: STARS_TWINKLE }} />
      </div>
      <div className="scene-layer scene-depth-mid">
        <div className="scene-glow scene-glow-teal" />
        <div className="scene-glow scene-glow-purple" />
        <div className="scene-glow scene-glow-indigo" />
      </div>
      <div className="scene-spot" />
      <div className="scene-floor scene-depth-near">
        <div className="scene-grid" />
      </div>
      <div className="scene-horizon" />
      <div className="scene-meteor scene-meteor-1" />
      <div className="scene-meteor scene-meteor-2" />
      <div className="scene-dim" />
    </div>
  );
}
