/** The server's password rules (backend auth/schemas.py, _validate_password). */
export const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 8,   label: '8+ characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'an uppercase letter' },
  { test: (p: string) => /[a-z]/.test(p), label: 'a lowercase letter' },
  { test: (p: string) => /\d/.test(p),    label: 'a digit' },
];

export const passwordOk = (password: string) => PASSWORD_RULES.every(r => r.test(password));

/** The rules as a checklist under a password box, ticked off while typing. */
export function PasswordChecklist({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
      {PASSWORD_RULES.map(r => {
        const met = r.test(password);
        return (
          <li key={r.label} className={met ? 'text-green-400' : 'text-gray-400'}>
            <span aria-hidden="true">{met ? '✓' : '○'}</span> {r.label}
            <span className="sr-only">{met ? ' (done)' : ' (still needed)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
