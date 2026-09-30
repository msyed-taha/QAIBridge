import { useState } from 'react';
import { Check, ChevronDown, Copy, FileCode2 } from 'lucide-react';

interface Props {
  code: string;
  title?: string;
  subtitle?: string;
  defaultOpen?: boolean;
  maxHeight?: number;
}

/** Collapsible, copyable code panel (used for the exported Qiskit programs). */
export function CodeBlock({ code, title = 'Code', subtitle, defaultOpen = false, maxHeight = 380 }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the text is still selectable */ }
  };

  return (
    <div className="bg-quantum-800 border border-quantum-700 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 text-left">
          <FileCode2 className="w-4 h-4 text-quantum-neon" />
          <span className="text-white font-bold text-sm">{title}</span>
          {subtitle && <span className="text-gray-500 text-xs hidden sm:inline">— {subtitle}</span>}
          <ChevronDown className={`w-4 h-4 text-gray-500 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white border border-quantum-600 rounded-lg px-2 py-1"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-quantum-neon" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {open && (
        <pre
          className="text-[11px] leading-relaxed text-gray-300 font-mono bg-quantum-900/70 border-t border-quantum-700 px-5 py-4 overflow-auto"
          style={{ maxHeight }}
        >
          {code}
        </pre>
      )}
    </div>
  );
}
