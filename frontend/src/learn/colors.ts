import type { GateName } from './gates';

// The Learn colours: teal for 0, purple for 1, and blends in between.

export type RGB = [number, number, number];

export const ZERO_RGB: RGB = [0, 255, 204];
export const ONE_RGB: RGB = [204, 68, 255];
export const ZERO_COLOR = '#00ffcc';
export const ONE_COLOR = '#cc44ff';

/** The teal gradient of the main buttons and of a picked choice. */
export const BRAND_FILL = 'linear-gradient(90deg, #00ffcc, #00ccaa)';

/** The teal-to-purple gradient of the course's highlights: the step bar, the title, the lock. */
export const ACCENT_FILL = `linear-gradient(90deg, ${ZERO_COLOR}, ${ONE_COLOR})`;

export const rgba = (c: RGB, alpha = 1) => `rgba(${c.map(Math.round).join(',')},${alpha})`;

/** Each gate's colour, wherever gates are drawn. */
export const GATE_COLORS: Record<GateName, string> = { X: '#22d3ee', H: '#a855f7', Z: '#fbbf24' };

/** Teal at a 0% chance of 1, purple at 100%, blended in between. */
export const oddsRGB = (chanceOf1: number): RGB =>
  ZERO_RGB.map((z, i) => z + (ONE_RGB[i] - z) * chanceOf1) as RGB;
