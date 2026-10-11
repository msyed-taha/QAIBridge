import { forwardRef, useRef, type DragEvent } from 'react';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** A file dropped onto the editor. */
  onFile: (file: File) => void;
  /** 1-based line to mark as the problem, if any. */
  errorLine: number | null;
  /** 1-based line to mark as "this is where we are" (step by step), if any. */
  activeLine?: number | null;
  labelledBy: string;
  describedBy: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * A plain code box for OpenQASM: line numbers beside it (so "Line 4" in a message
 * is easy to find, and the problem line is marked), no spell-check, no wrapping.
 */
export const QasmEditor = forwardRef<HTMLTextAreaElement, Props>(function QasmEditor(
  { id, value, onChange, onFile, errorLine, activeLine, labelledBy, describedBy, disabled, placeholder }, ref,
) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lines = Math.max(1, value.split('\n').length);

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    onFile(file);
  };

  return (
    <div className={`flex rounded-lg border bg-quantum-900/80 overflow-hidden h-80 lg:h-[26rem] ${
      errorLine ? 'border-red-700' : 'border-quantum-600 focus-within:border-quantum-neon/60'}`}>
      <div ref={gutterRef} aria-hidden="true"
        className="select-none overflow-hidden py-3 pl-3 pr-2 text-right font-mono text-sm leading-6 text-gray-400 bg-quantum-800/60 border-r border-quantum-700">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={
            i + 1 === errorLine ? 'text-red-200 bg-red-500/30 -mr-2 pr-2 rounded-l'
            : i + 1 === activeLine ? 'text-black bg-quantum-neon font-semibold -mr-2 pr-2 rounded-l'
            : undefined}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={ref}
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={e => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={onDrop}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={errorLine !== null || undefined}
        disabled={disabled}
        placeholder={placeholder}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="flex-1 min-w-0 resize-none bg-transparent py-3 px-3 font-mono text-sm leading-6 [font-variant-ligatures:none] text-gray-100 placeholder:text-gray-400 focus:outline-none disabled:opacity-60"
      />
    </div>
  );
});

/** Scroll a line into view (without moving the cursor) if it is out of sight. */
export function scrollToLine(box: HTMLTextAreaElement | null, line: number) {
  if (!box) return;
  const lineHeight = parseFloat(getComputedStyle(box).lineHeight) || 24;
  const top = (line - 1) * lineHeight;
  if (top < box.scrollTop || top + lineHeight > box.scrollTop + box.clientHeight - 16) {
    box.scrollTop = Math.max(0, top - box.clientHeight / 3);
  }
}

/** Put the cursor on a line (selecting it) and scroll it into view. */
export function goToLine(box: HTMLTextAreaElement | null, line: number) {
  if (!box) return;
  const text = box.value;
  let start = 0;
  for (let i = 1; i < line && start >= 0; i++) start = text.indexOf('\n', start) + 1 || -1;
  if (start < 0) start = text.length;
  const end = text.indexOf('\n', start);
  box.focus();
  box.setSelectionRange(start, end < 0 ? text.length : end);
  const lineHeight = parseFloat(getComputedStyle(box).lineHeight) || 24;
  box.scrollTop = Math.max(0, (line - 1) * lineHeight - box.clientHeight / 3);
}
