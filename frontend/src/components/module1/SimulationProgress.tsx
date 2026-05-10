interface Props {
  percent: number;
  step: string;
}

export function SimulationProgress({ percent, step }: Props) {
  return (
    <div className="bg-quantum-800 rounded-xl p-4 border border-quantum-600">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-300">{step}</span>
        <span className="text-quantum-neon font-mono">{percent}%</span>
      </div>
      <div className="w-full bg-quantum-700 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-quantum-neon to-quantum-purple rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
