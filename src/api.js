// base URL for backend. allow override through Vite env (VITE_SERVER_URL)
// and make sure we always include a protocol so fetch() doesn't send ":3001/..."
// which would result in the browser requesting the current host on port 3001.
let API_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
// special case: if the variable is just a port like ":3001", assume localhost
if (API_URL.startsWith(":")) {
  API_URL = `http://localhost${API_URL}`;
}
// otherwise if there's no protocol yet, prepend http://
if (!API_URL.startsWith("http://") && !API_URL.startsWith("https://")) {
  API_URL = `http://${API_URL}`;
}

/* -----------------------------
   helpers
----------------------------- */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getToken() {
  return localStorage.getItem("sd_token") || "";
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || "Invalid server response");
  }

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

/* -----------------------------
   AUTH
----------------------------- */
export async function requestOtp(email) {
  const normalized = normalizeEmail(email);
  return request("/auth/request-otp", {
    method: "POST",
    body: { email: normalized },
  });
}

export async function verifyOtp({ email, otp }) {
  const normalized = normalizeEmail(email);
  return request("/auth/verify-otp", {
    method: "POST",
    body: { email: normalized, otp },
  });
}

export async function getMe(token) {
  const res = await fetch(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function updateUsername(token, username) {
  const res = await fetch(`${API_URL}/me/username`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username }),
  });
  return res.json();
}

/* -----------------------------
   FRIENDS (MATCH FriendsPanel)
----------------------------- */
export const friendsApi = {
  // GET /friends/list
  list: () => request("/friends/list", { auth: true }),

  // GET /friends/requests
  requests: () => request("/friends/requests", { auth: true }),

  // POST /friends/request { uid }
  requestByUid: (uid) =>
    request("/friends/request", { method: "POST", auth: true, body: { uid } }),

  // POST /friends/accept { uid }
  accept: (uid) =>
    request("/friends/accept", { method: "POST", auth: true, body: { uid } }),

  // POST /friends/decline { uid }
  decline: (uid) =>
    request("/friends/decline", { method: "POST", auth: true, body: { uid } }),
};

/* -----------------------------
   LEADERBOARD
----------------------------- */
export async function getLeaderboard(limit = 10) {
  return request(`/leaderboard?limit=${limit}`);
}
