import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Atom, Copy, Cpu, FolderOpen, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { workApi, circuitLink, timeAgo, type CircuitSummary, type Project } from '../api/work';
import { getApiErrorMessage } from '../api/client';

type View = 'all' | 'none' | number;

const TOOL = {
  builder:   { name: 'Circuit Builder', Icon: Atom },
  simulator: { name: 'Simulator', Icon: Cpu },
} as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A small form for a project's name and description (new or edited). */
function ProjectForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: { name: string; description: string };
  submitLabel: string;
  onSubmit: (name: string, description: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { name: useId(), description: useId(), problem: useId() };
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const missing = !name.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (missing) { nameRef.current?.focus(); return; }
    setBusy(true); setError(null);
    try { await onSubmit(name.trim(), description.trim()); }
    catch (err) { setError(getApiErrorMessage(err, "Couldn't save the project. Please try again.")); setBusy(false); }
  };

  return (
    <form onSubmit={submit} noValidate onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
      className="space-y-2 bg-quantum-900/60 border border-quantum-600 rounded-xl p-3">
      <div>
        <label htmlFor={ids.name} className="block text-xs text-gray-400 mb-1">Project name</label>
        <input ref={nameRef} id={ids.name} value={name} onChange={e => setName(e.target.value)} maxLength={100}
          aria-invalid={(tried && missing) || undefined} aria-describedby={tried && missing ? ids.problem : undefined}
          className={`w-full bg-quantum-900 border rounded-lg px-3 py-2 text-sm text-gray-100 ${tried && missing ? 'border-red-700' : 'border-quantum-600'}`} />
        {tried && missing && <p id={ids.problem} className="text-xs text-red-300 mt-1">Give the project a name.</p>}
      </div>
      <div>
        <label htmlFor={ids.description} className="block text-xs text-gray-400 mb-1">Description (optional)</label>
        <textarea id={ids.description} value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={2}
          className="w-full bg-quantum-900 border border-quantum-600 rounded-lg px-3 py-2 text-sm text-gray-100 resize-y" />
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-quantum-neon text-black text-sm font-semibold hover:bg-teal-300 disabled:opacity-50">
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-quantum-600 text-sm text-gray-200">Cancel</button>
      </div>
    </form>
  );
}

/** One saved circuit: open it, rename it, copy it, file it in a project, or delete it. */
function CircuitRow({ c, projects, onChange, onCopy, onDelete }: {
  c: CircuitSummary;
  projects: Project[];
  onChange: (c: CircuitSummary) => void;
  onCopy: (c: CircuitSummary) => void;
  onDelete: (c: CircuitSummary) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.name);
  const [error, setError] = useState<string | null>(null);
  const tool = TOOL[c.opens_in];
  const ids = { name: useId(), project: useId() };
  const renameRef = useRef<HTMLButtonElement>(null);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      onChange(await workApi.update(c.id, { name: name.trim() }));
      setRenaming(false); setError(null);
      renameRef.current?.focus();
    } catch (err) { setError(getApiErrorMessage(err, "Couldn't rename it.")); }
  };
  const move = async (value: string) => {
    try { onChange(await workApi.update(c.id, { project_id: value ? Number(value) : null })); setError(null); }
    catch (err) { setError(getApiErrorMessage(err, "Couldn't move it.")); }
  };

  const action = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-quantum-600 text-xs text-gray-200 hover:border-quantum-400';
  return (
    <li className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {renaming ? (
            <form onSubmit={rename} onKeyDown={e => { if (e.key === 'Escape') { setRenaming(false); setName(c.name); } }} className="flex gap-2">
              <label htmlFor={ids.name} className="sr-only">New name</label>
              <input id={ids.name} value={name} onChange={e => setName(e.target.value)} maxLength={100} autoFocus
                className="bg-quantum-900 border border-quantum-600 rounded-lg px-2 py-1 text-sm text-gray-100" />
              <button type="submit" className="px-2.5 py-1 rounded-lg bg-quantum-neon text-black text-xs font-semibold">Save</button>
            </form>
          ) : (
            <Link to={circuitLink(c)} className="text-white font-semibold hover:text-quantum-neon break-words">{c.name}</Link>
          )}
          <p className="text-xs text-gray-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1"><tool.Icon className="w-3.5 h-3.5" aria-hidden="true" />{tool.name}</span>
            <span aria-hidden="true">·</span>
            <span>{c.n_qubits !== null && c.gate_count !== null ? `${plural(c.n_qubits, 'qubit')}, ${plural(c.gate_count, 'gate')}` : 'Has a mistake to fix'}</span>
            <span aria-hidden="true">·</span>
            <span>Edited {timeAgo(c.updated_at)}</span>
          </p>
        </div>
        <Link to={circuitLink(c)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-quantum-neon text-black text-sm font-semibold hover:bg-teal-300">
          Open<span className="sr-only"> {c.name}</span>
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button ref={renameRef} type="button" className={action} onClick={() => { setName(c.name); setRenaming(r => !r); }}>
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />Rename<span className="sr-only"> {c.name}</span>
        </button>
        <button type="button" className={action} onClick={() => onCopy(c)}>
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />Copy<span className="sr-only"> {c.name}</span>
        </button>
        <label htmlFor={ids.project} className="sr-only">Project for {c.name}</label>
        <select id={ids.project} value={c.project_id ?? ''} onChange={e => move(e.target.value)}
          className="bg-quantum-900 border border-quantum-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 max-w-[12rem]">
          <option value="">No project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" className={`${action} hover:border-red-700 hover:text-red-300 sm:ml-auto`} onClick={() => onDelete(c)}>
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />Delete<span className="sr-only"> {c.name}</span>
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </li>
  );
}

export function WorkPage() {
  const [circuits, setCircuits] = useState<CircuitSummary[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<View>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([workApi.circuits(), workApi.projects()])
      .then(([c, p]) => { setCircuits(c); setProjects(p); })
      .catch(e => setError(getApiErrorMessage(e, "Couldn't load your work. Please try again.")));
  }, []);

  const counts = useMemo(() => {
    const m = new Map<number | null, number>();
    for (const c of circuits ?? []) m.set(c.project_id, (m.get(c.project_id) ?? 0) + 1);
    return m;
  }, [circuits]);
  const project = typeof view === 'number' ? projects.find(p => p.id === view) ?? null : null;
  const shown = (circuits ?? []).filter(c => view === 'all' || (view === 'none' ? c.project_id === null : c.project_id === view));

  const replace = (c: CircuitSummary) =>
    setCircuits(list => [c, ...(list ?? []).filter(x => x.id !== c.id)].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));

  const copy = async (c: CircuitSummary) => {
    try { const made = await workApi.copy(c.id); replace(made); setNotice(`Made "${made.name}".`); }
    catch (e) { setError(getApiErrorMessage(e, "Couldn't copy it.")); }
  };
  const remove = async (c: CircuitSummary) => {
    if (!window.confirm(`Delete "${c.name}"? This can't be undone.`)) return;
    try { await workApi.remove(c.id); setCircuits(list => (list ?? []).filter(x => x.id !== c.id)); setNotice(`Deleted "${c.name}".`); }
    catch (e) { setError(getApiErrorMessage(e, "Couldn't delete it.")); }
  };
  const createProject = async (name: string, description: string) => {
    const p = await workApi.createProject(name, description);
    setProjects(list => [p, ...list]);
    setCreating(false);
    setView(p.id);
  };
  const editProject = async (name: string, description: string) => {
    if (!project) return;
    const p = await workApi.updateProject(project.id, { name, description });
    setProjects(list => list.map(x => (x.id === p.id ? p : x)));
    setEditing(false);
  };
  const deleteProject = async () => {
    if (!project) return;
    const n = counts.get(project.id) ?? 0;
    if (!window.confirm(`Delete the project "${project.name}"?${n ? ` Its ${plural(n, 'circuit')} will be kept, outside any project.` : ''}`)) return;
    try {
      await workApi.removeProject(project.id);
      setProjects(list => list.filter(x => x.id !== project.id));
      setCircuits(list => (list ?? []).map(c => (c.project_id === project.id ? { ...c, project_id: null } : c)));
      setView('all');
      setNotice(`Deleted the project "${project.name}".`);
    } catch (e) { setError(getApiErrorMessage(e, "Couldn't delete the project.")); }
  };

  const tab = (v: View, label: string, n: number) => (
    <li key={String(v)}>
      <button type="button" onClick={() => { setView(v); setEditing(false); }} aria-current={view === v ? 'true' : undefined}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left ${
          view === v ? 'bg-quantum-neon/10 text-white font-semibold' : 'text-gray-300 hover:bg-quantum-700'}`}>
        <span className="min-w-0 truncate">{label}</span>
        <span className="text-xs text-gray-400 tabular-nums">{n}</span>
      </button>
    </li>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white">My work</h1>
          <p className="text-gray-300 text-sm mt-1">
            Your saved circuits and projects. Once a circuit is saved, changes in the Circuit Builder or the Simulator save on their own.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/circuit?new" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-quantum-neon text-black text-sm font-semibold hover:bg-teal-300">
            <Plus className="w-4 h-4" aria-hidden="true" />New in Circuit Builder
          </Link>
          <Link to="/simulator" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-quantum-600 text-sm text-gray-200 hover:border-quantum-400">
            <Plus className="w-4 h-4" aria-hidden="true" />New in Simulator
          </Link>
        </div>
      </div>

      {error && <p role="alert" className="bg-red-900/30 border border-red-700 rounded-xl p-3 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="text-sm text-gray-300">{notice}</p>}

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] items-start">
        <nav aria-label="Projects" className="glass-card rounded-2xl p-3 space-y-3">
          <h2 className="px-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">Projects</h2>
          <ul className="space-y-1">
            {tab('all', 'All circuits', circuits?.length ?? 0)}
            {tab('none', 'Not in a project', counts.get(null) ?? 0)}
            {projects.map(p => tab(p.id, p.name, counts.get(p.id) ?? 0))}
          </ul>
          {creating
            ? <ProjectForm submitLabel="Create project" onSubmit={createProject} onCancel={() => setCreating(false)} />
            : (
              <button type="button" onClick={() => setCreating(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-quantum-500 text-sm text-gray-200 hover:border-quantum-neon">
                <FolderPlus className="w-4 h-4" aria-hidden="true" />New project
              </button>
            )}
        </nav>

        <section aria-labelledby="work-list" className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="work-list" className="text-lg font-semibold text-white break-words">
                {project ? project.name : view === 'none' ? 'Not in a project' : 'All circuits'}
              </h2>
              {project?.description && <p className="text-sm text-gray-300 mt-1 break-words">{project.description}</p>}
            </div>
            {project && !editing && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-quantum-600 text-sm text-gray-200 hover:border-quantum-400">
                  <Pencil className="w-4 h-4" aria-hidden="true" />Edit project
                </button>
                <button type="button" onClick={deleteProject}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-quantum-600 text-sm text-gray-200 hover:border-red-700 hover:text-red-300">
                  <Trash2 className="w-4 h-4" aria-hidden="true" />Delete project
                </button>
              </div>
            )}
          </div>
          {project && editing && (
            <ProjectForm initial={project} submitLabel="Save project" onSubmit={editProject} onCancel={() => setEditing(false)} />
          )}

          {circuits === null && !error ? (
            <p className="text-sm text-gray-400">Loading your work…</p>
          ) : shown.length ? (
            <ul className="space-y-3">
              {shown.map(c => (
                <CircuitRow key={c.id} c={c} projects={projects} onChange={replace} onCopy={copy} onDelete={remove} />
              ))}
            </ul>
          ) : (
            <div className="glass-card rounded-2xl p-6 text-center space-y-2">
              <FolderOpen className="w-8 h-8 text-gray-400 mx-auto" aria-hidden="true" />
              <p className="text-white font-semibold">
                {view === 'all' ? 'No saved circuits yet' : 'No circuits here yet'}
              </p>
              <p className="text-sm text-gray-300">
                {view === 'all'
                  ? <>Build one in the <Link to="/circuit" className="underline text-quantum-neon">Circuit Builder</Link> or write one in
                    the <Link to="/simulator" className="underline text-quantum-neon">Simulator</Link>, then press Save.</>
                  : <>Save a circuit into this project, or move one here from All circuits.</>}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
