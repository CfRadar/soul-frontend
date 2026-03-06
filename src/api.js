// base URL for backend. allow override through Vite env (VITE_API_URL)
// Use https:// for production, fallback to localhost:3001 for dev
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Debug log in development
if (import.meta.env.DEV) {
  console.log("API_URL =", API_URL);
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

  // Safe JSON parsing - handle HTML error pages (e.g., Vercel 404/500)
  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");

  if (!isJson) {
    // Return a safe error response instead of throwing
    return {
      ok: false,
      error: "bad_response",
      status: res.status,
    };
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      error: "bad_response",
      status: res.status,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `HTTP ${res.status}`,
      status: res.status,
    };
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
  
  // Safe JSON parsing for getMe
  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  
  if (!isJson) {
    return { ok: false, error: "bad_response", status: res.status };
  }
  
  try {
    return await res.json();
  } catch {
    return { ok: false, error: "bad_response", status: res.status };
  }
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
  
  // Safe JSON parsing for updateUsername
  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  
  if (!isJson) {
    return { ok: false, error: "bad_response", status: res.status };
  }
  
  try {
    return await res.json();
  } catch {
    return { ok: false, error: "bad_response", status: res.status };
  }
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

/* -----------------------------
   TIME TRIAL
----------------------------- */
export async function getTimeTrialLeaderboard(limit = 50) {
  return request(`/time-trial/leaderboard?limit=${limit}`);
}

export async function submitTimeTrial(timeMs) {
  return request("/time-trial/submit", {
    method: "POST",
    auth: true,
    body: { timeMs },
  });
}

/* -----------------------------
   BOSSES
----------------------------- */
export async function getBossUnlocks(token) {
  const res = await fetch(`${API_URL}/bosses/unlocks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  if (!isJson) return { ok: false, error: "bad_response", status: res.status };
  
  try {
    return await res.json();
  } catch {
    return { ok: false, error: "bad_response", status: res.status };
  }
}

export async function unlockBoss(token, bossId) {
  const res = await fetch(`${API_URL}/bosses/unlock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ bossId }),
  });
  
  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  if (!isJson) return { ok: false, error: "bad_response", status: res.status };
  
  try {
    return await res.json();
  } catch {
    return { ok: false, error: "bad_response", status: res.status };
  }
}
