import { Brain, Code2, Scale, Atom, Cpu, TrendingUp, Network, BarChart2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Every tool in the app, under the plain name used everywhere a user sees it:
// the Tools menu, the app home page and the browser tab. `module` is the
// Scope document's module number, still shown at the top of each tool's page.

export type ToolGroup = 'solve' | 'build' | 'research' | 'results';

export interface Tool {
  module: number;
  path: string;
  alsoAt?: string[];   // older addresses that open the same page
  name: string;
  short: string;       // one line, for the menu
  desc: string;        // a sentence, for the app home page
  group: ToolGroup;
  icon: LucideIcon;
  color: string;
}

export const TOOL_GROUPS: { id: ToolGroup; label: string }[] = [
  { id: 'solve',    label: 'Solve a problem' },
  { id: 'build',    label: 'Learn and build' },
  { id: 'research', label: 'Research tools' },
  { id: 'results',  label: 'Your results' },
];

export const TOOLS: Tool[] = [
  { module: 4, path: '/module4', name: 'AI Advisor', group: 'solve', icon: Brain, color: '#f97316',
    short: 'Can quantum help with my problem?',
    desc: 'Describe a problem or upload a file. Find out if quantum computing can help, and which method fits.' },
  { module: 5, path: '/module5', name: 'Code to Quantum', group: 'solve', icon: Code2, color: '#cc44ff',
    short: 'Python code → a checked quantum circuit',
    desc: 'Paste Python code and get a quantum circuit that solves the same problem, checked against your code.' },
  { module: 2, path: '/module2', name: 'Quantum vs Classical', group: 'solve', icon: Scale, color: '#14b8a6',
    short: 'Grover, Shor and QAOA vs classical',
    desc: 'Run Grover, Shor and QAOA next to the best classical method on the same input, and check both answers.' },
  { module: 3, path: '/circuit', alsoAt: ['/module3'], name: 'Circuit Builder', group: 'build', icon: Atom, color: '#34d399',
    short: 'Drag-and-drop gates and challenges',
    desc: 'Drag gates onto a circuit, see the result straight away, and try 10 challenges.' },
  { module: 1, path: '/simulator', alsoAt: ['/module1'], name: 'Quantum Simulator', group: 'build', icon: Cpu, color: '#00ffcc',
    short: 'Run circuits, see the memory limit',
    desc: "Run ready-made circuits on QAIbridge's own simulator and see how the memory needed grows with each qubit." },
  { module: 6, path: '/module6', name: 'Neural Optimizer', group: 'research', icon: TrendingUp, color: '#a855f7',
    short: 'A neural network tunes gate angles',
    desc: 'A neural network learns the gate angles of a quantum classifier. Compare it with tuning the angles directly.' },
  { module: 7, path: '/module7', name: 'Neural Network Converter', group: 'research', icon: Network, color: '#3b82f6',
    short: 'Classical network → quantum network',
    desc: 'Turn a classical neural network into a quantum one, then train both and compare.' },
  { module: 8, path: '/dashboard', alsoAt: ['/module8'], name: 'Performance Dashboard', group: 'results', icon: BarChart2, color: '#fbbf24',
    short: 'Benchmarks and your saved runs',
    desc: 'Live quantum vs classical benchmarks, your saved runs, and CSV export.' },
];

export const isToolAt = (tool: Tool, pathname: string) =>
  tool.path === pathname || !!tool.alsoAt?.includes(pathname);

export const toolsIn = (group: ToolGroup) => TOOLS.filter(t => t.group === group);
