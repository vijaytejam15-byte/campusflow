/**
 * Central API helper — HTTP-only cookie auth, no axios, no localStorage.
 *
 * Base URL is configured via REACT_APP_API_URL.
 * When empty (local dev), requests are relative and handled by the CRA proxy
 * defined in package.json ("proxy": "http://localhost:5000").
 *
 * Session expiry
 * ──────────────
 * When any request returns 401, the sessionExpiredHandler is called (if set).
 * AuthContext wires this up via setSessionExpiredHandler() after mount so that
 * any 401 anywhere in the app redirects to /login?sessionExpired=true.
 */

const API_URL = process.env.REACT_APP_API_URL || "";

// Handler called when any request gets a 401 Unauthorized response.
let _sessionExpiredHandler = null;

export function setSessionExpiredHandler(fn) {
  _sessionExpiredHandler = fn;
}

/**
 * Upload files (multipart/form-data) and return the server-side metadata.
 * Does NOT set Content-Type — browser must set it with the boundary.
 *
 * @param {File[]} fileList  Array of File objects from an <input type="file">
 * @returns {Promise<{ files: {filename,originalName,mimeType,size}[] }>}
 */
export async function uploadFiles(fileList) {
  const formData = new FormData();
  for (const f of fileList) {
    formData.append("documents", f);
  }
  const response = await fetch(`${API_URL}/api/upload`, {
    method:      "POST",
    credentials: "include",
    body:        formData,
    // DO NOT set Content-Type here — browser adds multipart boundary automatically
  });

  let data = {};
  try { data = await response.json(); } catch { /* empty */ }

  if (response.status === 401 && _sessionExpiredHandler) {
    _sessionExpiredHandler();
    throw Object.assign(new Error(data.message || "Session expired"), { status: 401 });
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.message || "Upload failed"), { status: response.status });
  }
  return data;
}

async function _request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include", // always send/receive the httpOnly auth cookie
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = {};
  try {
    data = await response.json();
  } catch (e) {
    // no/invalid JSON body — ignore
  }

  if (response.status === 401 && _sessionExpiredHandler) {
    _sessionExpiredHandler();
    // Throw so callers can still catch / bail out
    const err = new Error(data.message || "Session expired");
    err.status = 401;
    throw err;
  }

  if (!response.ok) {
    const error = new Error(data.message || "Request failed");
    error.status = response.status;
    throw error;
  }

  return data;
}

export const api = {
  // expose _request so service files can use it directly
  _request,

  // ── Auth ────────────────────────────────────────────────────────────────────
  register: (body) =>
    _request("/api/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) =>
    _request("/api/login", { method: "POST", body: JSON.stringify(body) }),
  me:     () => _request("/api/me",     { method: "GET"  }),
  logout: () => _request("/api/logout", { method: "POST" }),

  // ── Profile ─────────────────────────────────────────────────────────────────
  getProfile: () => _request("/api/profile", { method: "GET" }),
  updateProfile: (body) =>
    _request("/api/profile", { method: "PUT", body: JSON.stringify(body) }),
  changePassword: (body) =>
    _request("/api/change-password", { method: "POST", body: JSON.stringify(body) }),

  // ── Courses ─────────────────────────────────────────────────────────────────
  getCourses: (search) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return _request(`/api/courses${query}`, { method: "GET" });
  },
  getCourse:    (id)       => _request(`/api/courses/${id}`, { method: "GET" }),
  createCourse: (body)     => _request("/api/courses",       { method: "POST",   body: JSON.stringify(body) }),
  updateCourse: (id, body) => _request(`/api/courses/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
  deleteCourse: (id)       => _request(`/api/courses/${id}`, { method: "DELETE" }),
};
