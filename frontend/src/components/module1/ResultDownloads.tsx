import { useState } from 'react';
import { Download } from 'lucide-react';
import type { SimulationResult } from '../../types';
import { kernelApi } from '../../api/kernel';
import { getApiErrorMessage } from '../../api/client';

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The listed outcomes as a spreadsheet: chance, how often each was seen, and the
 * amplitude behind it. Outcomes keep their |…> marks so spreadsheets don't drop
 * leading zeros. Outcomes seen but not among the listed ones have no chance shown.
 */
function resultsCsv(r: SimulationResult): string {
  const amps = new Map(r.amplitudes.map(a => [a.state, a]));
  const states = [...new Set([...Object.keys(r.probabilities), ...Object.keys(r.counts)])];
  states.sort((a, b) => (r.probabilities[b] ?? -1) - (r.probabilities[a] ?? -1) || (r.counts[b] ?? 0) - (r.counts[a] ?? 0));
  const first = r.labels?.[0] ?? 'q0';
  const lines = [`outcome (${first} first),chance,seen,amplitude_real,amplitude_imag`];
  for (const s of states) {
    const a = amps.get(s);
    lines.push([s, r.probabilities[s] ?? '', r.counts[s] ?? 0, a?.real ?? '', a?.imag ?? ''].join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';     // the mark tells Excel the file is UTF-8
}

interface Props {
  result: SimulationResult;
  /** The circuit text that was run. */
  source: string;
  shots: number;
  /** A short name for the files, e.g. "random-circuit". */
  slug: string;
}

/** Take the result away: a spreadsheet, the circuit itself, and a file to check it with Qiskit. */
export function ResultDownloads({ result, source, shots, slug }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `qaibridge-${slug}-${result.n_qubits}q`;

  const forQiskit = async () => {
    setBusy(true); setError(null);
    try {
      save(`${base}.py`, await kernelApi.exportQiskit(source, shots), 'text/x-python');
    } catch (e) {
      setError(getApiErrorMessage(e, "Couldn't make the Qiskit file. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const btn = 'inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-quantum-600 text-gray-200 hover:border-quantum-400 disabled:opacity-50 transition-colors';
  return (
    <div className="border-t border-quantum-600 pt-4 space-y-2">
      <h3 className="text-sm font-semibold text-white">Download</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => save(`${base}.csv`, resultsCsv(result), 'text/csv;charset=utf-8')}>
          <Download className="w-4 h-4" aria-hidden="true" />Results (CSV)
        </button>
        <button type="button" className={btn} onClick={() => save(`${base}.qasm`, source, 'text/plain;charset=utf-8')}>
          <Download className="w-4 h-4" aria-hidden="true" />Circuit (.qasm)
        </button>
        <button type="button" className={btn} onClick={forQiskit} disabled={busy}>
          <Download className="w-4 h-4" aria-hidden="true" />{busy ? 'Preparing…' : 'For Qiskit (.py)'}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <p className="text-xs text-gray-400 leading-relaxed">
        Check it yourself: the Qiskit file runs this circuit on IBM's Qiskit and prints the counts in the same order as
        here. QAIbridge's engine is tested against Qiskit on more than 120 circuits.
      </p>
    </div>
  );
}
