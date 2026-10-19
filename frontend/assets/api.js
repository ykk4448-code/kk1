/** Small typed-by-contract HTTP client. All reads/writes use a single origin. */
const ORIGIN = '/api/v1';
let token = sessionStorage.getItem('aether_token') || '';
let user = null;

export async function request(path, options = {}) {
  const response = await fetch(ORIGIN + path, {
    ...options,
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : Array.isArray(data?.detail) ? data.detail.map(e => e.msg).join('；') : `HTTP ${response.status}`;
    const err = new Error(detail); err.status = response.status; throw err;
  }
  return data;
}

export const get = path => request(path);
export const post = (path, data) => request(path, { method:'POST',body:JSON.stringify(data) });
export const patch = (path, data) => request(path, { method:'PATCH',body:JSON.stringify(data) });
export const del = path => request(path, { method:'DELETE' });
export const whoami = () => user;
export const isDemo = async () => (await get('/health')).demo_mode;

export async function login(username, password) {
  const response = await post('/auth/login',{ username, password });
  token = response.access_token;
  sessionStorage.setItem('aether_token',token);
  user = response.user;
  return user;
}
export async function initAuth() {
  if (token) {
    try { user = await get('/auth/me'); return user; } catch { token = ''; sessionStorage.removeItem('aether_token'); }
  }
  if (await isDemo()) return login('admin','demo123456');
  return null;
}
export function logout() { token = ''; user = null; sessionStorage.removeItem('aether_token'); }
