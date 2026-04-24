/**
 * Shinhan Housing — 공통 API 클라이언트
 *
 * 1단계(프론트엔드만): window.SH_API.mock === true 이면 로컬 JSON(`assets/products.json`)을 사용합니다.
 * 2단계(백엔드 연결): .env 또는 배포 시점에 API_BASE_URL을 설정하고 mock=false로 전환합니다.
 */
(function () {
  'use strict';

  const DEFAULT_BASE = (window.SH_API_BASE__ || '/api').replace(/\/$/, '');
  const MOCK = !!window.SH_API_MOCK__;

  const TOKEN_KEY = 'sh_admin_token';
  const REFRESH_KEY = 'sh_admin_refresh';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(access, refresh) {
    if (access) localStorage.setItem(TOKEN_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  async function request(path, opts = {}) {
    const url = DEFAULT_BASE + path;
    const headers = Object.assign(
      { 'Accept': 'application/json' },
      opts.headers || {}
    );
    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    if (opts.auth !== false) {
      const t = getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    }
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401 && opts.auth !== false) {
      clearToken();
      if (opts.redirectOn401 !== false && location.pathname.endsWith('/admin.html')) {
        location.reload();
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`API ${res.status}: ${text || res.statusText}`);
      err.status = res.status;
      throw err;
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }

  // ----- Mock 모드: 로컬 JSON 기반 동작 -----
  let mockCache = null;
  async function loadMock() {
    if (mockCache) return mockCache;
    const res = await fetch('assets/products.json');
    if (!res.ok) throw new Error('products.json not found');
    mockCache = await res.json();
    return mockCache;
  }

  function paginate(arr, page, limit) {
    const p = Math.max(1, parseInt(page || 1, 10));
    const l = Math.max(1, Math.min(120, parseInt(limit || 24, 10)));
    const total = arr.length;
    const items = arr.slice((p - 1) * l, p * l);
    return { items, page: p, limit: l, total, hasMore: p * l < total };
  }

  const Public = {
    async getCategories() {
      if (MOCK) {
        const data = await loadMock();
        return data.categories;
      }
      return request('/categories', { auth: false });
    },
    async getProducts(query = {}) {
      if (MOCK) {
        const data = await loadMock();
        let list = data.products.filter(p => p.isActive !== false);
        if (query.type) list = list.filter(p => p.type === query.type);
        if (query.category) list = list.filter(p => p.categorySlug === query.category);
        if (query.q) {
          const q = String(query.q).toLowerCase();
          list = list.filter(p =>
            (p.code || '').toLowerCase().includes(q) ||
            (p.name || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q)
          );
        }
        return paginate(list, query.page, query.limit);
      }
      const qs = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
      return request('/products?' + qs.toString(), { auth: false });
    },
    async getProduct(code) {
      if (MOCK) {
        const data = await loadMock();
        const p = data.products.find(x => x.code === code);
        if (!p) { const e = new Error('not found'); e.status = 404; throw e; }
        return p;
      }
      return request('/products/' + encodeURIComponent(code), { auth: false });
    },
    async submitInquiry(body) {
      if (MOCK) {
        console.log('[MOCK] inquiry submitted:', body);
        await new Promise(r => setTimeout(r, 400));
        return { id: 'mock-' + Date.now(), status: 'new' };
      }
      return request('/inquiries', { method: 'POST', body, auth: false });
    },
  };

  const Admin = {
    async login(email, password) {
      const r = await request('/admin/login', { method: 'POST', body: { email, password }, auth: false });
      setToken(r.accessToken, r.refreshToken);
      return r;
    },
    logout() { clearToken(); },
    isLoggedIn() { return !!getToken(); },
    listProducts: q => request('/admin/products?' + new URLSearchParams(q || {}).toString()),
    createProduct: b => request('/admin/products', { method: 'POST', body: b }),
    updateProduct: (id, b) => request('/admin/products/' + id, { method: 'PUT', body: b }),
    deleteProduct: id => request('/admin/products/' + id, { method: 'DELETE' }),
    uploadImage: (id, formData) => request(`/admin/products/${id}/images`, { method: 'POST', body: formData }),
    getUploadUrl: (id, meta) => request(`/admin/products/${id}/images/upload-url`, { method: 'POST', body: meta }),
    confirmUpload: (id, body) => request(`/admin/products/${id}/images/confirm`, { method: 'POST', body }),
    updateImage: (pid, iid, b) => request(`/admin/products/${pid}/images/${iid}`, { method: 'PUT', body: b }),
    deleteImage: (pid, iid) => request(`/admin/products/${pid}/images/${iid}`, { method: 'DELETE' }),
    listInquiries: q => request('/admin/inquiries?' + new URLSearchParams(q || {}).toString()),
    updateInquiry: (id, b) => request('/admin/inquiries/' + id, { method: 'PUT', body: b }),
  };

  window.SH_API = { Public, Admin, mock: MOCK, getToken, setToken, clearToken };
})();
