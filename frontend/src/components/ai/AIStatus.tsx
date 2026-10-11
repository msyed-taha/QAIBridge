import { Bot, WifiOff } from 'lucide-react';
import type { AIStatus } from '../../api/ai';

/** "AI reads your code · 38 of 40 left today", or why the AI is off and what is used instead. */
export function AIStatusLine({ status, reads, fallback }: { status: AIStatus | null; reads: string; fallback: string }) {
  if (!status) return null;
  return status.available ? (
    <p className="inline-flex items-center gap-1.5 text-xs text-purple-200 bg-purple-500/10 border border-purple-500/30 rounded-full px-3 py-1">
      <Bot className="w-3.5 h-3.5" aria-hidden="true" />
      AI reads {reads} · {status.remaining_today} of {status.daily_limit} left today
    </p>
  ) : (
    <p className="inline-flex items-center gap-1.5 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1">
      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" /> {status.message} {fallback}
    </p>
  );
}

/** The label on anything the AI wrote. */
export function WrittenByAI({ checked = 'checked by the simulator' }: { checked?: string }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-purple-200 bg-purple-500/10 border border-purple-500/30 rounded-full px-2.5 py-0.5">
      <Bot className="w-3.5 h-3.5" aria-hidden="true" /> Written by AI{checked ? `, ${checked}` : ''}
    </p>
  );
}
