import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { BRAND_FILL } from '../../learn/colors';

/** "Create a free account" and "Sign in". Both bring the visitor back to `from` afterwards. */
export function SignUpButtons({ from }: { from: string }) {
  const state = { from };
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
      <Link to="/register" state={state}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-black text-sm hover:brightness-110 transition-all"
        style={{ background: BRAND_FILL }}>
        <UserPlus className="w-4 h-4" /> Create a free account
      </Link>
      <Link to="/login" state={state}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm bg-quantum-700 border border-quantum-500 hover:border-quantum-neon/50 transition-all">
        Sign in
      </Link>
    </div>
  );
}
