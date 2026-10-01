import { useEffect, useRef, useState } from 'react';

type Vec = [number, number, number];

// Quantum gates as turns of the Bloch sphere: the axis and the angle each one rotates by.
const GATES = [
  { name: 'H',  axis: [Math.SQRT1_2, 0, Math.SQRT1_2] as Vec, angle: Math.PI },
  { name: 'X',  axis: [1, 0, 0] as Vec, angle: Math.PI },
  { name: 'Y',  axis: [0, 1, 0] as Vec, angle: Math.PI },
  { name: 'Z',  axis: [0, 0, 1] as Vec, angle: Math.PI },
  { name: 'S',  axis: [0, 0, 1] as Vec, angle: Math.PI / 2 },
  { name: 'T',  axis: [0, 0, 1] as Vec, angle: Math.PI / 4 },
  { name: '√X', axis: [1, 0, 0] as Vec, angle: Math.PI / 2 },
];
type Gate = typeof GATES[number];

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (v: Vec, k: number): Vec => [v[0] * k, v[1] * k, v[2] * k];
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

// Rodrigues' formula: v turned about the unit axis k by angle a.
function rotate(v: Vec, k: Vec, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a), kv = dot(k, v) * (1 - c);
  return [
    v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * kv,
    v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * kv,
    v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * kv,
  ];
}

// A random gate that visibly moves the state (Z, S and T do nothing at the poles).
function nextGate(v: Vec, prev: string): Gate {
  const visible = GATES.filter(g =>
    g.name !== prev && Math.acos(clamp(dot(v, rotate(v, g.axis, g.angle)), -1, 1)) > 0.6);
  return visible[Math.floor(Math.random() * visible.length)] ?? GATES[0];
}

// Wireframe circles, in sphere coordinates (z up).
const SEG = 72;
const ring = (f: (t: number) => Vec) => Array.from({ length: SEG }, (_, i) => f((i / SEG) * Math.PI * 2));
const rad = (deg: number) => (deg * Math.PI) / 180;
const LATITUDES = [-60, -30, 30, 60].map(d =>
  ring(t => [Math.cos(rad(d)) * Math.cos(t), Math.cos(rad(d)) * Math.sin(t), Math.sin(rad(d))]));
const EQUATOR = ring(t => [Math.cos(t), Math.sin(t), 0]);
const MERIDIANS = [0, 30, 60, 90, 120, 150].map(d =>
  ring(t => [Math.sin(t) * Math.cos(rad(d)), Math.sin(t) * Math.sin(rad(d)), Math.cos(t)]));

const TEAL: Vec = [0, 255, 204];
const PURPLE: Vec = [204, 68, 255];
const rgba = (c: Vec, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
// |0⟩ is teal, |1⟩ is purple, and states in between are a blend.
const stateColour = (v: Vec): Vec => {
  const p = (1 - v[2]) / 2;
  return [TEAL[0] + (PURPLE[0] - TEAL[0]) * p, TEAL[1] + (PURPLE[1] - TEAL[1]) * p, TEAL[2] + (PURPLE[2] - TEAL[2]) * p];
};

const PERSP = 5;                               // camera distance, in sphere radii
const DEPTH_ALPHA = [0.06, 0.12, 0.26, 0.5];   // wireframe, back → front
const YAW0 = -0.45, PITCH0 = 0.38;              // resting view, slightly from above
const SPIN = 0.00015;                           // radians per ms
const SCROLL_TURN = 0.0025;                     // radians per scrolled pixel
const T_DRAW = [250, 1650], T_ARROW = [1650, 2150], T_FIRST_GATE = 2500; // arrival, ms
const MOVE = 1300, HOLD = 1100, TRAIL_MS = 1800;
const STILL_STATE: Vec = (() => { const th = rad(55), ph = rad(20); return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]; })();

type Frame = {
  yaw: number; pitch: number; intro: number; arrow: number; now: number;
  state: Vec; axis: Vec | null; axisAlpha: number; trail: { v: Vec; t: number }[];
};

/**
 * The home-page centrepiece: one qubit on a glowing Bloch sphere, turned by real
 * quantum gates (H, X, S, T…) one after another. The sphere draws itself in on
 * arrival, spins slowly, leans toward the mouse and turns as the page scrolls.
 * Drawn on a canvas with plain 3D maths (no 3D library), paused while off-screen,
 * and shown still for "reduce motion".
 */
export function QubitSphere({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const gateRef = useRef<HTMLSpanElement>(null);
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let w = 0, h = 0;

    const draw = (f: Frame) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const fade = easeOut(f.intro);
      const R = Math.min(w, h) * 0.34 * (0.82 + 0.18 * fade);
      const rim = (R * PERSP) / Math.sqrt(PERSP * PERSP - 1); // outline of the sphere in perspective
      const cyaw = Math.cos(f.yaw), syaw = Math.sin(f.yaw), cp = Math.cos(f.pitch), sp = Math.sin(f.pitch);
      // Sphere coordinates → screen; d is +1 nearest the viewer, −1 at the back.
      const P = (v: Vec) => {
        const x1 = v[0] * cyaw - v[1] * syaw, y1 = v[0] * syaw + v[1] * cyaw;
        const y2 = y1 * cp - v[2] * sp, z2 = y1 * sp + v[2] * cp;
        const k = PERSP / (PERSP + y2);
        return { x: cx + x1 * R * k, y: cy - z2 * R * k, d: -y2 };
      };
      const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      };
      ctx.lineCap = 'round';

      // Glow behind, then the glass body.
      ctx.globalAlpha = fade;
      let g = ctx.createRadialGradient(cx, cy, rim * 0.5, cx, cy, Math.min(w, h) / 2);
      g.addColorStop(0, 'rgba(119,119,238,.24)');
      g.addColorStop(0.55, 'rgba(204,68,255,.07)');
      g.addColorStop(1, 'rgba(0,255,204,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      g = ctx.createRadialGradient(cx - rim * 0.38, cy - rim * 0.42, rim * 0.04, cx, cy, rim);
      g.addColorStop(0, 'rgba(255,255,255,.14)');
      g.addColorStop(0.5, 'rgba(85,85,204,.08)');
      g.addColorStop(1, 'rgba(204,68,255,.18)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, rim, 0, Math.PI * 2); ctx.fill();

      // Wireframe: each circle is split into depth bands so the back is fainter.
      const reveal = easeInOut(f.intro);
      const strokeRing = (pts: Vec[], style: string | CanvasGradient, width: number, boost: number) => {
        const proj = pts.map(P);
        const bands = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
        const n = Math.floor(SEG * reveal);
        for (let i = 0; i < n; i++) {
          const a = proj[i], b = proj[(i + 1) % SEG];
          const band = bands[Math.min(3, Math.floor(((a.d + b.d) / 2 + 1) * 2))];
          band.moveTo(a.x, a.y); band.lineTo(b.x, b.y);
        }
        ctx.strokeStyle = style; ctx.lineWidth = width;
        bands.forEach((p, i) => { ctx.globalAlpha = Math.min(1, DEPTH_ALPHA[i] * boost) * fade; ctx.stroke(p); });
      };
      for (const r of MERIDIANS) strokeRing(r, 'rgb(119,119,238)', 1, 1);
      for (const r of LATITUDES) strokeRing(r, 'rgb(119,119,238)', 1, 1);
      const brand = ctx.createLinearGradient(cx - rim, cy, cx + rim, cy);
      brand.addColorStop(0, rgba(TEAL)); brand.addColorStop(1, rgba(PURPLE));
      strokeRing(EQUATOR, brand, 1.5, 1.8);

      // Glowing outline.
      ctx.globalAlpha = 0.8 * fade;
      ctx.strokeStyle = brand; ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0,255,204,.6)'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(cx, cy, rim, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;

      // Axes, and the axis the current gate turns about.
      ctx.setLineDash([3, 5]); ctx.lineWidth = 1; ctx.strokeStyle = '#fff';
      for (const [ax, a] of [[[1, 0, 0], 0.16], [[0, 1, 0], 0.16], [[0, 0, 1], 0.32]] as [Vec, number][]) {
        ctx.globalAlpha = a * fade; line(P(scale(ax, -1.18)), P(scale(ax, 1.18)));
      }
      if (f.axis && f.axisAlpha > 0) {
        ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(TEAL);
        ctx.globalAlpha = 0.7 * f.axisAlpha * fade;
        line(P(scale(f.axis, -1.3)), P(scale(f.axis, 1.3)));
      }
      ctx.setLineDash([]);

      // |0⟩ and |1⟩ at the poles.
      ctx.font = `500 ${Math.max(11, Math.round(R * 0.085))}px "Fira Code", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e5e7eb'; ctx.globalAlpha = 0.85 * fade;
      for (const [label, z] of [['|0⟩', 1.3], ['|1⟩', -1.3]] as [string, number][]) {
        const p = P([0, 0, z]); ctx.fillText(label, p.x, p.y);
      }

      if (f.arrow <= 0) return;
      const col = stateColour(f.state);

      // Path the state just travelled, fading out.
      ctx.lineWidth = 2; ctx.strokeStyle = rgba(col);
      for (let i = 1; i < f.trail.length; i++) {
        ctx.globalAlpha = clamp(1 - (f.now - f.trail[i].t) / TRAIL_MS) * 0.8 * fade;
        line(P(f.trail[i - 1].v), P(f.trail[i].v));
      }

      // The state arrow, with guide lines down to the equator for depth.
      const len = easeOut(f.arrow);
      const o = P([0, 0, 0]), tip = P(scale(f.state, len));
      const foot = P([f.state[0] * len, f.state[1] * len, 0]);
      ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.25 * fade;
      line(o, foot); line(foot, tip);
      ctx.setLineDash([]);
      const behind = 0.65 + 0.35 * (tip.d + 1) / 2;
      g = ctx.createLinearGradient(o.x, o.y, tip.x, tip.y);
      g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(1, rgba(col));
      ctx.strokeStyle = g; ctx.lineWidth = 2.75; ctx.globalAlpha = behind * fade;
      line(o, tip);
      g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 20);
      g.addColorStop(0, rgba(col, 0.6)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip.x, tip.y, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.shadowColor = rgba(col); ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(col); ctx.globalAlpha = 0.9 * fade;
      ctx.beginPath(); ctx.arc(o.x, o.y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    };

    const drawStill = () => draw({
      yaw: YAW0, pitch: PITCH0, intro: 1, arrow: 1, now: 0,
      state: STILL_STATE, axis: null, axisAlpha: 0, trail: [],
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (still) drawStill();
    };
    const sizer = new ResizeObserver(resize);
    sizer.observe(canvas);
    resize();
    if (still) return () => sizer.disconnect();

    // ── Animation ──
    let raf = 0, running = false, start = 0;
    let state: Vec = [0, 0, 1];               // starts in |0⟩
    let gate: Gate | null = null, from: Vec = state, gateT0 = 0;
    const trail: { v: Vec; t: number }[] = [];
    let px = 0, py = 0, pointer = false, leanX = 0, leanY = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!start) start = now;
      const t = now - start;

      let axisAlpha = 0;
      if (t >= T_FIRST_GATE) {
        if (!gate || now - gateT0 >= MOVE + HOLD) {
          if (gate) state = rotate(from, gate.axis, gate.angle);
          gate = gate ? nextGate(state, gate.name) : GATES[0]; // H first: |0⟩ → |+⟩
          from = state; gateT0 = now;
          if (gateRef.current) gateRef.current.textContent = gate.name;
          if (captionRef.current) captionRef.current.style.opacity = '1';
        }
        const p = Math.min(1, (now - gateT0) / MOVE);
        state = rotate(from, gate.axis, gate.angle * easeInOut(p));
        if (p < 1) trail.push({ v: state, t: now });
        axisAlpha = Math.sin(clamp((now - gateT0) / (MOVE + HOLD * 0.6)) * Math.PI);
      }
      while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();

      // Lean toward the mouse (smoothed), turn with scrolling, and spin slowly.
      if (pointer) {
        const r = canvas.getBoundingClientRect();
        const tx = clamp((px - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1);
        const ty = clamp((py - (r.top + r.height / 2)) / (window.innerHeight / 2), -1, 1);
        leanX += (tx - leanX) * 0.05; leanY += (ty - leanY) * 0.05;
      }
      draw({
        yaw: YAW0 + t * SPIN + window.scrollY * SCROLL_TURN + leanX * 0.6,
        pitch: PITCH0 + leanY * 0.25,
        intro: clamp((t - T_DRAW[0]) / (T_DRAW[1] - T_DRAW[0])),
        arrow: clamp((t - T_ARROW[0]) / (T_ARROW[1] - T_ARROW[0])),
        now, state, axis: gate?.axis ?? null, axisAlpha, trail,
      });
    };

    // Only animate while the sphere is on screen.
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) { running = true; raf = requestAnimationFrame(frame); }
      else if (!entry.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
    });
    watcher.observe(canvas);

    const onMove = (e: PointerEvent) => { px = e.clientX; py = e.clientY; pointer = true; };
    if (window.matchMedia('(pointer: fine)').matches) window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      sizer.disconnect();
      watcher.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, [still]);

  return (
    <div className={className} aria-hidden="true">
      <div className="aspect-square w-full">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
      {/* Pill with its own dark backing, so it reads cleanly over the background's lines */}
      <p ref={captionRef}
        className="mx-auto mt-1 w-fit flex items-center gap-1.5 rounded-full border border-quantum-700 bg-quantum-900/80 backdrop-blur-sm px-3 py-1 text-xs text-gray-400 transition-opacity duration-700"
        style={{ opacity: still ? 1 : 0 }}>
        {still ? 'One qubit, shown on the Bloch sphere' : (
          <>A qubit, turned by the
            <span ref={gateRef} className="min-w-[2em] text-center px-1.5 rounded-md bg-quantum-neon/10 border border-quantum-neon/30 font-mono text-quantum-neon">H</span>
            gate</>
        )}
      </p>
    </div>
  );
}
