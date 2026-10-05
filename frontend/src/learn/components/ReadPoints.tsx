import type { ReactNode } from 'react';

/** One reading point: a small picture on the left, a title and a few plain sentences. */
export function Point({ title, visual, children }: { title: string; visual: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">{visual}</div>
      <div>
        <h3 className="text-white font-semibold text-lg leading-snug mb-1.5">{title}</h3>
        <p className="text-gray-300 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

/** A coloured square holding an icon, used as a point's picture. */
export function IconTile({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="w-12 h-12 rounded-xl flex items-center justify-center"
      style={{ color, background: `${color}26`, border: `1px solid ${color}66` }}>
      {children}
    </span>
  );
}

/** The "Good to know" note at the end of a Read step. */
export function GoodToKnow({ children }: { children: ReactNode }) {
  return (
    <p className="text-gray-400 leading-relaxed border-l-2 border-quantum-neon/60 pl-4">
      <strong className="text-gray-200">Good to know:</strong> {children}
    </p>
  );
}
