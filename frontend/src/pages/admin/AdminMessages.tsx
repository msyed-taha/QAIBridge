import { useEffect, useState } from 'react';
import { Loader2, Trash2, Mail, MailOpen, Reply, UserCheck } from 'lucide-react';
import { adminApi } from '../../api/admin';
import { getApiErrorMessage } from '../../api/client';
import type { ContactMessage } from '../../types';
import { AdminLayout } from './AdminLayout';

type Filter = 'all' | 'unread';

export function AdminMessages() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [busyId, setBusyId]     = useState<number | null>(null);
  const [openId, setOpenId]     = useState<number | null>(null);
  const [filter, setFilter]     = useState<Filter>('all');

  useEffect(() => {
    adminApi.listMessages()
      .then(setMessages)
      .catch(e => setError(getApiErrorMessage(e, 'Could not load messages')))
      .finally(() => setLoading(false));
  }, []);

  const unread = messages.filter(m => !m.is_read).length;
  const shown  = filter === 'unread' ? messages.filter(m => !m.is_read) : messages;

  const mark = async (m: ContactMessage, is_read: boolean) => {
    if (m.is_read === is_read) return;
    setBusyId(m.id);
    setError(null);
    try {
      const updated = await adminApi.markMessage(m.id, is_read);
      setMessages(ms => ms.map(x => (x.id === m.id ? updated : x)));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Update failed'));
    } finally {
      setBusyId(null);
    }
  };

  const open = (m: ContactMessage) => {
    const opening = openId !== m.id;
    setOpenId(opening ? m.id : null);
    if (opening) mark(m, true);
  };

  const remove = async (m: ContactMessage) => {
    if (!window.confirm(`Delete the message from ${m.name}? This cannot be undone.`)) return;
    setBusyId(m.id);
    setError(null);
    try {
      await adminApi.deleteMessage(m.id);
      setMessages(ms => ms.filter(x => x.id !== m.id));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Delete failed'));
    } finally {
      setBusyId(null);
    }
  };

  const replyHref = (m: ContactMessage) =>
    `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || 'Your message to QAIbridge'}`)}`;

  return (
    <AdminLayout title="Messages" subtitle="What people sent through the Contact form. Opening a message marks it read.">
      <div className="flex items-center gap-1 mb-5">
        {(['all', 'unread'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f ? 'bg-quantum-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {f === 'all' ? `All (${messages.length})` : `Unread (${unread})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
      )}

      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl overflow-hidden">
        {loading && (
          <p className="px-4 py-8 text-center text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…
          </p>
        )}
        {!loading && shown.length === 0 && (
          <p className="px-4 py-10 text-center text-gray-600 text-sm">
            {filter === 'unread' ? 'No unread messages.' : 'No messages yet.'}
          </p>
        )}

        <ul className="divide-y divide-quantum-700/60">
          {shown.map(m => {
            const isOpen = openId === m.id;
            const busy   = busyId === m.id;
            return (
              <li key={m.id}>
                <button onClick={() => open(m)} className="w-full text-left px-4 py-3 hover:bg-quantum-700/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${m.is_read ? 'bg-transparent' : 'bg-quantum-neon'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className={`text-sm truncate ${m.is_read ? 'text-gray-300' : 'text-white font-semibold'}`}>
                          {m.name} <span className="text-gray-600 font-normal">· {m.email}</span>
                          {m.user_id && (
                            <span title="Sent while signed in" className="inline-flex items-center ml-2 text-teal-300/80 align-middle">
                              <UserCheck className="w-3 h-3" />
                            </span>
                          )}
                        </p>
                        <span className="text-gray-600 text-xs flex-shrink-0">
                          {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 truncate ${m.is_read ? 'text-gray-500' : 'text-gray-300'}`}>
                        {m.subject || <span className="italic text-gray-600">No subject</span>}
                        {!isOpen && <span className="text-gray-600"> — {m.message}</span>}
                      </p>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pl-9">
                    <p className="text-gray-300 text-sm whitespace-pre-wrap break-words leading-relaxed bg-quantum-900 border border-quantum-700 rounded-xl p-4">
                      {m.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <a href={replyHref(m)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-black"
                        style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}>
                        <Reply className="w-3.5 h-3.5" /> Reply by email
                      </a>
                      <button onClick={() => mark(m, false)} disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-quantum-700 border border-quantum-600 hover:text-white disabled:opacity-50">
                        <Mail className="w-3.5 h-3.5" /> Mark unread
                      </button>
                      <button onClick={() => remove(m)} disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-300 bg-red-950/30 border border-red-900/60 hover:bg-red-900/40 disabled:opacity-50">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
                      </button>
                      {m.is_read && <span className="text-gray-600 text-xs inline-flex items-center gap-1 ml-auto"><MailOpen className="w-3 h-3" /> read</span>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AdminLayout>
  );
}
