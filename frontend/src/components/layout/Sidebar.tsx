import { Link, useLocation } from 'react-router-dom';
import { Cpu, BookOpen, Database, Code, Brain, GitBranch, Layers, Home } from 'lucide-react';
import { QAIBridgeLogo } from './QAIBridgeLogo';

const NAV_ITEMS = [
  { path: '/',          label: 'Home',                 icon: Home,       active: true  },
  { path: '/module1',   label: 'Simulation Kernel',     icon: Cpu,        active: true  },
  { path: '/module2',   label: 'SFOD Suite',            icon: Layers,     active: true  },
  { path: '/module3',   label: 'Circuit Builder',       icon: BookOpen,   active: true  },
  { path: '/module4',   label: 'Arch Recommender',      icon: Database,   active: true  },
  { path: '/module5',   label: 'Logic Transformer',     icon: Code,       active: true  },
  { path: '/module6',   label: 'Neural Optimizer',      icon: Brain,      active: true  },
  { path: '/module7',   label: 'QNN Converter',         icon: GitBranch,  active: true  },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="w-56 bg-quantum-900 border-r border-quantum-700 flex flex-col">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-quantum-700">
        <QAIBridgeLogo size={36} showText={true} />
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ path, label, icon: Icon, active }) => {
          const isActive = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-quantum-600 text-white'
                  : active
                  ? 'text-gray-300 hover:bg-quantum-800 hover:text-white'
                  : 'text-gray-600 cursor-default pointer-events-none'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-quantum-neon' : ''}`} />
              <span className="truncate">{label}</span>
              {!active && (
                <span className="ml-auto text-xs bg-quantum-700 text-gray-500 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-quantum-700 text-xs text-gray-600">
        <p>© {new Date().getFullYear()} QAIbridge</p>
      </div>
    </aside>
  );
}
