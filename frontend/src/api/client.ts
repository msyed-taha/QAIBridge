import axios from 'axios';

/**
 * Shared axios instance. The auth token is stored by AuthContext under
 * 'qai_token' in localStorage on login, but until this interceptor existed
 * nothing ever attached it to outgoing requests — every call was effectively
 * anonymous regardless of login state. Reading directly from localStorage
 * (rather than through React context) keeps this usable from plain API
 * modules outside the component tree.
 */
export const apiClient = axios.create();

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('qai_token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * A saved login lasts a week, and an account can be closed or switched off.
 * When the server turns away the login this browser holds (a 401), the
 * listener (AuthContext) signs out and says so. Only a 401 for the login still
 * saved here counts, so a burst of failing requests, or a late reply from
 * before a new sign-in, acts just once. Other failures, like the server being
 * unreachable, never sign anyone out.
 */
let sessionEnded: (() => void) | null = null;

/** Listens for the server rejecting the saved login. Returns a function that stops listening. */
export function onSessionEnded(listener: () => void) {
  sessionEnded = listener;
  return () => { if (sessionEnded === listener) sessionEnded = null; };
}

apiClient.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    const saved = localStorage.getItem('qai_token');
    if (saved && error.config?.headers?.Authorization === `Bearer ${saved}`) sessionEnded?.();
  }
  return Promise.reject(error);
});

export default apiClient;

/**
 * Turn a FastAPI error `detail` into a readable string.
 *
 * `detail` is a plain string for a raised HTTPException (e.g. "Invalid email or
 * password."), but for a 422 request-validation error it's a *list* of
 * `{ loc, msg, type }` objects. Passing that list straight to React renders the
 * infamous "[object Object]".
 */
export function detailToMessage(detail: unknown, fallback = 'Request failed'): string {
  if (typeof detail === 'string' && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const msgs = detail
      .map(d => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : ''))
      .filter(Boolean);
    if (msgs.some(m => /valid email/i.test(m))) return 'Please enter a valid email address.';
    if (msgs.length) return msgs.join('. ');
  }

  return fallback;
}

/**
 * Readable message for an error thrown by a raw `fetch` call.
 *
 * A failed `fetch` (backend down, wrong port, DNS, CORS) throws
 * `TypeError: Failed to fetch` / `NetworkError` — opaque to a user. Turn that
 * into something actionable; otherwise fall back to the error's own message.
 */
export function friendlyError(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
    return "Can't reach the server. Make sure the backend is running on port 8000 (run-backend.ps1).";
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Pull a readable message out of an axios error, falling back gracefully. */
export function getApiErrorMessage(e: unknown, fallback = 'Request failed'): string {
  if (typeof e === 'object' && e !== null && 'response' in e) {
    const resp = (e as { response?: { data?: { detail?: unknown } } }).response;
    if (resp?.data?.detail !== undefined) return detailToMessage(resp.data.detail, fallback);
  }
  if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'ERR_NETWORK') {
    return "Can't reach the server. Make sure the backend is running on port 8000 (run-backend.ps1).";
  }
  return e instanceof Error ? e.message : fallback;
}
