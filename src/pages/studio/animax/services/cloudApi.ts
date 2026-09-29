const API_ORIGIN = window.location.hostname === 'rickai.github.io'
  ? 'https://animax-previewer.yongbiaoai.workers.dev' : '';

export function cloudFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (API_ORIGIN) {
    // An anonymous browser identity, independent of third-party cookie support.
    let token = localStorage.getItem('animax-cloud-session');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('animax-cloud-session', token);
    }
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`${API_ORIGIN}${path}`, { ...options, headers, credentials: API_ORIGIN ? 'omit' : 'same-origin' });
}
