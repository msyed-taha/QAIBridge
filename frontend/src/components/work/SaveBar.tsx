import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, FilePlus2, FolderOpen, Loader2, Save, X } from 'lucide-react';
import { workApi, type BuilderLayout, type Project, type SavedCircuit } from '../../api/work';
import { getApiErrorMessage } from '../../api/client';

export interface CircuitContent { qasm: string; layout?: BuilderLayout | null }
interface Attached { id: number; name: string }
type Status = 'saved' | 'saving' | 'error';

const AUTOSAVE_MS = 1200;

/**
 * Keeps a page's circuit tied to a saved circuit: once saved (or opened), every
 * change is saved again on its own after a short pause. While `paused` (e.g. the
 * Builder is showing a challenge level), nothing is saved.
 */
export function useSavedCircuit(content: CircuitContent, paused = false) {
  const [attached, setAttached] = useState<Attached | null>(null);
  const [status, setStatus] = useState<Status>('saved');
  const key = JSON.stringify(content);
  const lastSaved = useRef<string | null>(null);     // null = take the next content as already saved

  useEffect(() => {
    if (!attached || paused) return;
    if (lastSaved.current === null) { lastSaved.current = key; return; }
    if (key === lastSaved.current) { setStatus('saved'); return; }
    setStatus('saving');
    const t = window.setTimeout(async () => {
      try {
        await workApi.update(attached.id, JSON.parse(key) as CircuitContent);
        lastSaved.current = key;
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [key, attached, paused]);

  /** Tie the page to a circuit it has just opened (call in the same step as loading its content). */
  const attach = useCallback((c: Pick<SavedCircuit, 'id' | 'name'>) => {
    lastSaved.current = null;
    setAttached({ id: c.id, name: c.name });
    setStatus('saved');
  }, []);

  const detach = useCallback(() => setAttached(null), []);

  const saveNew = useCallback(async (name: string, projectId: number | null) => {
    const c = await workApi.save({ name, ...(JSON.parse(key) as CircuitContent), project_id: projectId });
    lastSaved.current = key;
    setAttached({ id: c.id, name: c.name });
    setStatus('saved');
    return c;
  }, [key]);

  const retry = useCallback(() => { lastSaved.current = ''; setAttached(a => (a ? { ...a } : a)); }, []);

  return { attached, status, attach, detach, saveNew, retry };
}

type Saved = ReturnType<typeof useSavedCircuit>;

interface Props {
  saved: Saved;
  /** Name offered when saving for the first time. */
  suggestName: string;
  /** Called after the first save, with the new circuit (e.g. to put ?c=<id> in the address). */
  onSaved: (c: SavedCircuit) => void;
  /** Start a new, unsaved circuit. */
  onNew: () => void;
  disabled?: boolean;
}

/** Save button, then the circuit's name and "All changes saved". */
export function SaveBar({ saved, suggestName, onSaved, onNew, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [newProject, setNewProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveBtn = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), project: useId(), newProject: useId(), panel: useId(), problem: useId() };

  const show = () => {
    setName(suggestName);
    setProjectId('');
    setNewProject('');
    setTried(false);
    setError(null);
    setOpen(true);
    workApi.projects().then(setProjects).catch(() => setProjects([]));
  };
  const close = useCallback(() => { setOpen(false); saveBtn.current?.focus(); }, []);

  useEffect(() => { if (open) nameRef.current?.select(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const making = projectId === 'new';
  const nameMissing = !name.trim();
  const projectMissing = making && !newProject.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (nameMissing) { nameRef.current?.focus(); return; }
    if (projectMissing) { document.getElementById(ids.newProject)?.focus(); return; }
    setBusy(true); setError(null);
    try {
      const pid = making ? (await workApi.createProject(newProject.trim())).id : projectId ? Number(projectId) : null;
      const c = await saved.saveNew(name.trim(), pid);
      setOpen(false);
      onSaved(c);
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full bg-quantum-900 border rounded-lg px-3 py-2 text-sm text-gray-100';
  const { attached, status } = saved;

  return (
    <div className="relative flex flex-wrap items-center gap-2 text-sm">
      {attached ? (
        <>
          <span className="text-white font-medium max-w-[14rem] truncate" title={attached.name}>{attached.name}</span>
          <span role="status" className={`inline-flex items-center gap-1 text-xs ${status === 'error' ? 'text-amber-300' : 'text-gray-400'}`}>
            {status === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Saving…</>}
            {status === 'saved' && <><Check className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />All changes saved</>}
            {status === 'error' && (
              <><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />Not saved.{' '}
                <button type="button" onClick={saved.retry} className="underline hover:text-white">Try again</button></>
            )}
          </span>
          <button type="button" onClick={onNew} disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-quantum-600 text-gray-200 hover:border-quantum-400 disabled:opacity-50">
            <FilePlus2 className="w-4 h-4" aria-hidden="true" />New circuit
          </button>
        </>
      ) : (
        <button ref={saveBtn} type="button" onClick={() => (open ? close() : show())} disabled={disabled}
          aria-expanded={open} aria-controls={ids.panel}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-quantum-neon text-black font-semibold hover:bg-teal-300 disabled:opacity-50">
          <Save className="w-4 h-4" aria-hidden="true" />Save
        </button>
      )}
      <Link to="/work" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-quantum-600 text-gray-200 hover:border-quantum-400">
        <FolderOpen className="w-4 h-4" aria-hidden="true" />My work
      </Link>

      {open && !attached && (
        <form id={ids.panel} onSubmit={submit} noValidate
          className="absolute left-0 top-full mt-2 z-30 w-[min(20rem,calc(100vw-3rem))] bg-quantum-800 border border-quantum-600 rounded-xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-white font-semibold">Save this circuit</p>
            <button type="button" onClick={close} aria-label="Close" className="p-1 rounded text-gray-400 hover:text-white">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div>
            <label htmlFor={ids.name} className="block text-xs text-gray-400 mb-1">Name</label>
            <input ref={nameRef} id={ids.name} value={name} onChange={e => setName(e.target.value)} maxLength={100}
              aria-invalid={(tried && nameMissing) || undefined} aria-describedby={tried && nameMissing ? ids.problem : undefined}
              className={`${field} ${tried && nameMissing ? 'border-red-700' : 'border-quantum-600'}`} />
            {tried && nameMissing && <p id={ids.problem} className="text-xs text-red-300 mt-1">Give your circuit a name.</p>}
          </div>
          <div>
            <label htmlFor={ids.project} className="block text-xs text-gray-400 mb-1">Project</label>
            <select id={ids.project} value={projectId} onChange={e => setProjectId(e.target.value)}
              className={`${field} border-quantum-600`}>
              <option value="">No project</option>
              {(projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="new">New project…</option>
            </select>
          </div>
          {making && (
            <div>
              <label htmlFor={ids.newProject} className="block text-xs text-gray-400 mb-1">New project's name</label>
              <input id={ids.newProject} value={newProject} onChange={e => setNewProject(e.target.value)} maxLength={100}
                aria-invalid={(tried && projectMissing) || undefined}
                className={`${field} ${tried && projectMissing ? 'border-red-700' : 'border-quantum-600'}`} />
              {tried && projectMissing && <p className="text-xs text-red-300 mt-1">Give the new project a name.</p>}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy}
              className="flex-1 py-2 rounded-lg bg-quantum-neon text-black font-semibold hover:bg-teal-300 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={close} className="px-3 py-2 rounded-lg border border-quantum-600 text-gray-200">Cancel</button>
          </div>
          <p className="text-xs text-gray-400">After this, changes save on their own.</p>
        </form>
      )}
    </div>
  );
}
