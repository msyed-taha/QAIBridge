import { Binary, Layers, Eye, RotateCw, Waves, Link2, Wind, AudioWaveform, Rocket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// The Learn course: nine short lessons on how quantum computers work. Each one
// has four parts: Read, See (an interactive picture), Play (a small game) and
// Check (one question). Signed-out visitors can open the `free` lessons; the
// rest ask them to sign in first.

export type LessonPart = 'basics' | 'qubits' | 'limits';

export interface Lesson {
  n: number;
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  free: boolean;
  part: LessonPart;
  icon: LucideIcon;
  color: string;
}

export const LESSON_PARTS: { id: LessonPart; label: string }[] = [
  { id: 'basics', label: 'Part 1 · The basics' },
  { id: 'qubits', label: 'Part 2 · Working with qubits' },
  { id: 'limits', label: 'Part 3 · Power and limits' },
];

export const LESSONS: Lesson[] = [
  { n: 1, slug: 'bit-vs-qubit', title: 'Bit vs qubit', minutes: 4, free: true, part: 'basics', icon: Binary, color: '#00ffcc',
    summary: 'A bit is either 0 or 1. A qubit can point anywhere on a sphere.' },
  { n: 2, slug: 'superposition', title: 'Superposition', minutes: 4, free: true, part: 'basics', icon: Layers, color: '#22d3ee',
    summary: 'How a qubit holds a mix of 0 and 1, and what that really means.' },
  { n: 3, slug: 'measurement', title: 'Measurement', minutes: 4, free: true, part: 'basics', icon: Eye, color: '#3b82f6',
    summary: 'Looking at a qubit makes it pick 0 or 1, with odds you can predict.' },
  { n: 4, slug: 'quantum-gates', title: 'Quantum gates', minutes: 5, free: false, part: 'qubits', icon: RotateCw, color: '#7777ee',
    summary: 'The moves that turn a qubit, and why every one of them can be undone.' },
  { n: 5, slug: 'interference', title: 'Interference', minutes: 5, free: false, part: 'qubits', icon: Waves, color: '#a855f7',
    summary: 'How quantum waves cancel wrong answers and boost the right one.' },
  { n: 6, slug: 'entanglement', title: 'Entanglement', minutes: 6, free: false, part: 'qubits', icon: Link2, color: '#cc44ff',
    summary: 'Two qubits whose results always match, without any message between them.' },
  { n: 7, slug: 'decoherence', title: 'Decoherence', minutes: 4, free: false, part: 'limits', icon: Wind, color: '#ec4899',
    summary: 'Why qubits lose their quantum state, and why that limits computers today.' },
  { n: 8, slug: 'quantum-fourier-transform', title: 'Quantum Fourier Transform', minutes: 6, free: false, part: 'limits', icon: AudioWaveform, color: '#f97316',
    summary: "Finding the hidden rhythm in a pattern, the key step in Shor's algorithm." },
  { n: 9, slug: 'quantum-advantage', title: 'Quantum advantage', minutes: 5, free: false, part: 'limits', icon: Rocket, color: '#fbbf24',
    summary: 'When quantum computers really win, and by how much.' },
];

export const FREE_LESSON_COUNT = LESSONS.filter(l => l.free).length;
export const TOTAL_MINUTES = LESSONS.reduce((sum, l) => sum + l.minutes, 0);

export const lessonBySlug = (slug?: string) => LESSONS.find(l => l.slug === slug);
export const lessonPath = (lesson: Lesson) => `/learn/${lesson.slug}`;
