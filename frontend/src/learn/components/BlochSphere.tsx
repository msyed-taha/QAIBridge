import { useEffect, useRef, useState } from 'react';
import { blochVector, fromVector, percentages, deg } from '../qubit';
import type { QubitState, Vec3 } from '../qubit';
import { project, unproject, LESSON_VIEW } from '../sphereView';

// Wireframe circles in sphere coordinates (z up).
const SEG = 72;
const ring = (f: (t: number) => Vec3) => Array.from({ length: SEG }, (_, i) => f((i / SEG) * Math.PI * 2));
const r = (d: number) => (d * Math.PI) / 180;
const LATITUDES = [-60, -30, 30, 60].map(d => ring(t => [Math.cos(r(d)) * Math.cos(t), Math.cos(r(d)) * Math.sin(t), Math.sin(r(d))]));
const EQUATOR = ring(t => [Math.cos(t), Math.sin(t), 0]);
const MERIDIANS = [0, 30, 60, 90, 120, 150].map(d => ring(t => [Math.sin(t) * Math.cos(r(d)), Math.sin(t) * Math.sin(r(d)), Math.cos(t)]));
const DEPTH_ALPHA = [0.07, 0.14, 0.28, 0.5]; // wireframe, back → front

type RGB = [number, number, number];
const TEAL: RGB = [0, 255, 204];
const PURPLE: RGB = [204, 68, 255];
const TARGET = '#fbbf24';
const rgba = (c: RGB, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
// The arrow is teal near |0⟩, purple near |1⟩, and a blend in between.
const stateColour = (oneChance: number): RGB => [0, 1, 2].map(i => TEAL[i] + (PURPLE[i] - TEAL[i]) * oneChance) as RGB;

const radiusFor = (size: number) => size * 0.36;

interface Props {
  state: QubitState;
  /** Makes the arrow draggable. `final` is true when the drag ends. */
  onChange?: (state: QubitState, final: boolean) => void;
  /** A dashed yellow arrow to aim for (the games use it). */
  target?: QubitState | null;
  className?: string;
}

/**
 * A qubit drawn as an arrow on the Bloch sphere: |0⟩ at the top, |1⟩ at the
 * bottom. Drag the arrow (near side of the sphere) to move it. Drawn on a
 * canvas only when something changes, so it costs nothing while still.
 */
export function BlochSphere({ state, onChange, target = null, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);
  const dragging = useRef(false);                    // read by the handlers at once
  const [grabbing, setGrabbing] = useState(false);   // only for the cursor

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sizer = new ResizeObserver(() => setSize(canvas.clientWidth));
    sizer.observe(canvas);
    return () => sizer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !size) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSphere(ctx, size, state, target);
  }, [size, state, target]);

  // Pointer position → the state under it.
  const stateAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const R = radiusFor(rect.width);
    const u = (e.clientX - rect.left - rect.width / 2) / R;
    const v = (rect.height / 2 - (e.clientY - rect.top)) / R;
    return fromVector(unproject(u, v, LESSON_VIEW));
  };

  const [p0, p1] = percentages(state);
  const label = `Qubit arrow tilted ${Math.round(deg(state.theta))}° from 0: ${p0}% chance of 0, ${p1}% chance of 1.`
    + (target ? ` Target tilted ${Math.round(deg(target.theta))}°.` : '');

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className={`block w-full aspect-square ${onChange ? `touch-none ${grabbing ? 'cursor-grabbing' : 'cursor-grab'}` : ''} ${className}`}
      onPointerDown={onChange && (e => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true; setGrabbing(true);
        onChange(stateAt(e), false);
      })}
      onPointerMove={onChange && (e => { if (dragging.current) onChange(stateAt(e), false); })}
      onPointerUp={onChange && (e => {
        if (!dragging.current) return;
        dragging.current = false; setGrabbing(false);
        onChange(stateAt(e), true);
      })}
      onPointerCancel={() => { dragging.current = false; setGrabbing(false); }}
    />
  );
}

function drawSphere(ctx: CanvasRenderingContext2D, size: number, state: QubitState, target: QubitState | null) {
  const c = size / 2, R = radiusFor(size);
  const P = (v: Vec3) => {
    const p = project(v, LESSON_VIEW);
    return { x: c + p.u * R, y: c - p.v * R, d: p.depth };
  };
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';

  // Soft glow behind, then the glass body.
  let g = ctx.createRadialGradient(c, c, R * 0.6, c, c, size / 2);
  g.addColorStop(0, 'rgba(119,119,238,.18)');
  g.addColorStop(1, 'rgba(119,119,238,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  g = ctx.createRadialGradient(c - R * 0.38, c - R * 0.42, R * 0.04, c, c, R);
  g.addColorStop(0, 'rgba(255,255,255,.12)');
  g.addColorStop(0.5, 'rgba(85,85,204,.07)');
  g.addColorStop(1, 'rgba(204,68,255,.16)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();

  // Wireframe, fainter at the back.
  const strokeRing = (pts: Vec3[], style: string | CanvasGradient, width: number, boost: number) => {
    const proj = pts.map(P);
    const bands = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (let i = 0; i < SEG; i++) {
      const a = proj[i], b = proj[(i + 1) % SEG];
      const band = bands[Math.min(3, Math.floor(((a.d + b.d) / 2 + 1) * 2))];
      band.moveTo(a.x, a.y); band.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = style; ctx.lineWidth = width;
    bands.forEach((p, i) => { ctx.globalAlpha = Math.min(1, DEPTH_ALPHA[i] * boost); ctx.stroke(p); });
    ctx.globalAlpha = 1;
  };
  for (const m of MERIDIANS) strokeRing(m, 'rgb(119,119,238)', 1, 1);
  for (const l of LATITUDES) strokeRing(l, 'rgb(119,119,238)', 1, 1);
  const brand = ctx.createLinearGradient(c - R, c, c + R, c);
  brand.addColorStop(0, rgba(TEAL)); brand.addColorStop(1, rgba(PURPLE));
  strokeRing(EQUATOR, brand, 1.5, 1.8);

  // Outline, and the line through 0 and 1.
  ctx.strokeStyle = brand; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
  ctx.shadowColor = 'rgba(0,255,204,.5)'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.setLineDash([3, 5]); ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.35;
  line(P([0, 0, -1.15]), P([0, 0, 1.15]));
  ctx.setLineDash([]);

  // |0⟩ and |1⟩ just past the poles.
  ctx.globalAlpha = 0.95; ctx.fillStyle = '#e5e7eb';
  ctx.font = `600 ${Math.max(12, Math.round(size * 0.05))}px "Fira Code", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const top = P([0, 0, 1]), bottom = P([0, 0, -1]);
  ctx.fillText('|0⟩', top.x, top.y - size * 0.09);
  ctx.fillText('|1⟩', bottom.x, bottom.y + size * 0.09);
  ctx.globalAlpha = 1;

  const o = P([0, 0, 0]);

  // Target: a dashed yellow arrow with a ring at its tip.
  if (target) {
    const t = P(blochVector(target));
    ctx.setLineDash([5, 5]); ctx.strokeStyle = TARGET; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
    line(o, t);
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(t.x, t.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // The state arrow, with a guide down to the middle line for depth.
  const v = blochVector(state);
  const tip = P(v);
  const col = stateColour(percentages(state)[1] / 100);
  if (Math.hypot(v[0], v[1]) > 0.05) {
    const foot = P([v[0], v[1], 0]);
    ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.3;
    line(o, foot); line(foot, tip);
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  g = ctx.createLinearGradient(o.x, o.y, tip.x, tip.y);
  g.addColorStop(0, 'rgba(255,255,255,.25)'); g.addColorStop(1, rgba(col));
  ctx.strokeStyle = g; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.7 + 0.3 * (tip.d + 1) / 2;
  line(o, tip);
  ctx.globalAlpha = 1;
  g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 22);
  g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip.x, tip.y, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.shadowColor = rgba(col); ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(tip.x, tip.y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(col);
  ctx.beginPath(); ctx.arc(o.x, o.y, 3, 0, Math.PI * 2); ctx.fill();
}
