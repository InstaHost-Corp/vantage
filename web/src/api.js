const TOKEN_KEY = 'vantage.token';

// sessionStorage, not localStorage: this is a shared public demonstration, so
// the session must not outlive the browser tab. Nothing about a visitor's
// visit is left on their device after they close it.
const store = typeof sessionStorage !== 'undefined' ? sessionStorage : localStorage;

export const getToken = () => store.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? store.setItem(TOKEN_KEY, t) : store.removeItem(TOKEN_KEY));

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
