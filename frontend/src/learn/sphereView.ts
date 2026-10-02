import type { Vec3 } from './qubit';

// How the lesson spheres are seen: turned a little (yaw) and looked at from
// slightly above (pitch). A flat (orthographic) projection, so dragging can be
// turned back into an exact point on the sphere.

export interface View {
  yaw: number;
  pitch: number;
}

// The pitch is kept small so both poles sit almost on the outline, where they
// can be reached by dragging.
export const LESSON_VIEW: View = { yaw: -0.45, pitch: 0.17 };

/** A point on the unit sphere → its place on the unit disc (u right, v up),
 *  and its depth (1 = nearest the viewer, -1 = at the back). */
export function project([x, y, z]: Vec3, { yaw, pitch }: View) {
  const x1 = x * Math.cos(yaw) - y * Math.sin(yaw);
  const y1 = x * Math.sin(yaw) + y * Math.cos(yaw);
  const y2 = y1 * Math.cos(pitch) - z * Math.sin(pitch);
  const z2 = y1 * Math.sin(pitch) + z * Math.cos(pitch);
  return { u: x1, v: z2, depth: -y2 };
}

/** A place on the disc → the point of the sphere under it on the near side.
 *  Places outside the disc snap to the outline. */
export function unproject(u: number, v: number, { yaw, pitch }: View): Vec3 {
  const r = Math.hypot(u, v);
  if (r > 1) { u /= r; v /= r; }
  const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
  const x1 = u, z2 = v, y2 = -w;
  const y1 = y2 * Math.cos(pitch) + z2 * Math.sin(pitch);
  const z = -y2 * Math.sin(pitch) + z2 * Math.cos(pitch);
  return [x1 * Math.cos(yaw) + y1 * Math.sin(yaw), -x1 * Math.sin(yaw) + y1 * Math.cos(yaw), z];
}
