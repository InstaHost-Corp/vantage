const TOKEN_KEY = 'vantage.token';

// sessionStorage only: this is a shared public demonstration, so the session
// must not outlive the browser tab. When sessionStorage is unavailable the
// fallback is memory, never localStorage — a fallback that quietly persisted
// the token would defeat the whole point.
let memoryToken = null;
const sessionStore = (() => {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const probe = '__vantage_probe__';
    sessionStorage.setItem(probe, '1');
    sessionStorage.removeItem(probe);
    return sessionStorage;
  } catch {
    return null;
  }
})();

// Earlier versions kept the token in localStorage. Anyone who signed in then
// still has one sitting on their device, and nothing else would ever remove it.
try {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
} catch { /* storage may be blocked entirely; there is nothing to clean up */ }

export const getToken = () => (sessionStore ? sessionStore.getItem(TOKEN_KEY) : memoryToken);

export const setToken = (t) => {
  memoryToken = t || null;
  if (!sessionStore) return;
  if (t) sessionStore.setItem(TOKEN_KEY, t);
  else sessionStore.removeItem(TOKEN_KEY);
};

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && auth) {
    setToken(null);
    if (!location.pathname.startsWith('/trust')) location.assign('/login');
    throw new Error('Not authenticated');
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });

import { useCallback, useEffect, useState } from 'react';

export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const result = await api(path);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api(path)
      .then((result) => alive && setData(result))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return { data, error, loading, reload, setData };
}
