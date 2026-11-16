const API_BASE = 'https://overtime-logger.packagesgroup.com/api';
// const API_BASE = 'http://localhost:3000/api';

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const msg = data && (Array.isArray(data.message) ? data.message[0] : data.message);
    throw new Error(msg || 'Request failed');
  }
  return data;
}

export const api = {
  getConfig: () => request('/config'),
  approverStatus: () => request('/auth/status'),
  powerStatus: () => request('/auth/power-status'),
  login: (name, password) => request('/auth/login', { method: 'POST', body: { name, password } }),
  createPassword: (name, setupCode, password) => request('/auth/password', { method: 'POST', body: { name, setupCode, password } }),
  changePassword: (token, oldPassword, newPassword) =>
    request('/auth/change', { method: 'POST', token, body: { oldPassword, newPassword } }),
  logout: (token) => request('/auth/logout', { method: 'POST', token }),
  whoAmI: (token) => request('/auth/me', { token }),
  getRequests: (from, to) => request(`/requests?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  submitRequest: (p, pin) => request('/requests', { method: 'POST', body: { ...p, pin } }),
  decide: (token, ids, status, remark) => request('/requests/decide', { method: 'POST', token, body: { ids, status, remark } }),
  withdraw: (id, pin, token) => request(`/requests/${encodeURIComponent(id)}/withdraw`, { method: 'POST', token, body: { pin } }),
  saveActuals: (id, actuals, pin, token) =>
    request(`/requests/${encodeURIComponent(id)}/actuals`, { method: 'POST', token, body: { actuals, pin } }),
  async importEmployees(token, file) {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`${API_BASE}/employees/import`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }
    if (!res.ok) {
      const msg = data && (Array.isArray(data.message) ? data.message[0] : data.message);
      throw new Error(msg || 'Could not import employees');
    }
    return data;
  },
  async exportReport(token, from, to, section, label) {
    const res = await fetch(`${API_BASE}/reports/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ from, to, section, label }),
    });
    if (!res.ok) {
      let msg = 'Could not export';
      try {
        const data = await res.json();
        msg = Array.isArray(data.message) ? data.message[0] : data.message || msg;
      } catch {
        /* keep fallback */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
