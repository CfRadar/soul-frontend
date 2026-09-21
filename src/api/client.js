// client/src/api/client.js
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

if (import.meta.env.DEV) {
  console.log("[Client] API_URL =", API_URL);
}

export function getToken() {
  return localStorage.getItem("sd_token") || "";
}

export function setToken(token) {
  if (token) {
    localStorage.setItem("sd_token", token);
  } else {
    localStorage.removeItem("sd_token");
  }
}

export async function request(path, { method = "GET", body, auth = false } = {}) {
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

  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");

  if (!isJson) {
    return {
      ok: false,
      error: "bad_response",
      status: res.status,
    };
  }

  let data;
  try {
    const text = await res.text();
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
