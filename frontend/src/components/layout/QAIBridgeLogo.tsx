interface Props {
  size?: number;
  showText?: boolean;
}

export function QAIBridgeLogo({ size = 40, showText = true }: Props) {
  return (
    <div className="flex items-center gap-3">
      {/* SVG Icon Mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer glowing ring */}
        <circle cx="20" cy="20" r="18" stroke="url(#ringGradient)" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />

        {/* Inner circuit board base */}
        <rect x="8" y="8" width="24" height="24" rx="5" fill="url(#bgGradient)" />

        {/* Horizontal bridge line (the "Bridge" concept) */}
        <line x1="8" y1="20" x2="32" y2="20" stroke="url(#bridgeGradient)" strokeWidth="1.5" />

        {/* Left qubit node */}
        <circle cx="11" cy="20" r="2.5" fill="#00ffcc" />

        {/* Right qubit node */}
        <circle cx="29" cy="20" r="2.5" fill="#cc44ff" />

        {/* Middle quantum gate box */}
        <rect x="16" y="16" width="8" height="8" rx="2" fill="url(#gateGradient)" />

        {/* Gate symbol — H (Hadamard) */}
        <line x1="18.5" y1="18" x2="18.5" y2="22" stroke="white" strokeWidth="1.2" />
        <line x1="21.5" y1="18" x2="21.5" y2="22" stroke="white" strokeWidth="1.2" />
        <line x1="18.5" y1="20" x2="21.5" y2="20" stroke="white" strokeWidth="1.2" />

        {/* Top orbit arc — quantum probability wave */}
        <path
          d="M 12 20 Q 20 10 28 20"
          stroke="url(#arcGradient)"
          strokeWidth="1.2"
          fill="none"
          strokeDasharray="2 1.5"
          opacity="0.8"
        />

        {/* Bottom orbit arc */}
        <path
          d="M 12 20 Q 20 30 28 20"
          stroke="url(#arcGradient2)"
          strokeWidth="1.2"
          fill="none"
          strokeDasharray="2 1.5"
          opacity="0.8"
        />

        {/* Corner circuit trace dots */}
        <circle cx="11" cy="11" r="1" fill="#00ffcc" opacity="0.4" />
        <circle cx="29" cy="11" r="1" fill="#cc44ff" opacity="0.4" />
        <circle cx="11" cy="29" r="1" fill="#cc44ff" opacity="0.4" />
        <circle cx="29" cy="29" r="1" fill="#00ffcc" opacity="0.4" />

        {/* Gradient Definitions */}
        <defs>
          <linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#12122b" />
            <stop offset="100%" stopColor="#1a1a3e" />
          </linearGradient>
          <linearGradient id="bridgeGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00ffcc" />
            <stop offset="50%" stopColor="#7777ee" />
            <stop offset="100%" stopColor="#cc44ff" />
          </linearGradient>
          <linearGradient id="gateGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3333aa" />
            <stop offset="100%" stopColor="#5555cc" />
          </linearGradient>
          <linearGradient id="arcGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00ffcc" />
            <stop offset="100%" stopColor="#cc44ff" />
          </linearGradient>
          <linearGradient id="arcGradient2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#cc44ff" />
            <stop offset="100%" stopColor="#00ffcc" />
          </linearGradient>
          <linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00ffcc" />
            <stop offset="100%" stopColor="#cc44ff" />
          </linearGradient>
        </defs>
      </svg>

      {/* Text Mark */}
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-extrabold text-base tracking-tight">
            <span className="text-white">QAI</span>
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}
            >
              bridge
            </span>
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5 tracking-wide">
            Quantum Simulation Platform
          </span>
        </div>
      )}
    </div>
  );
}
