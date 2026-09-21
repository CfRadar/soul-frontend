import { request } from "../../../api/client";

export const authApi = {
  login: async ({ email, password }) => {
    return request("/auth/login", {
      method: "POST",
      body: {
        email: String(email || "").trim(),
        password: String(password || "").trim(),
      },
    });
  },

  signup: async ({ email, password, username }) => {
    return request("/auth/signup", {
      method: "POST",
      body: {
        email: String(email || "").trim(),
        password: String(password || "").trim(),
        username: String(username || "").trim(),
      },
    });
  },

  getMe: async (token) => {
    return request("/me", {
      auth: true,
    });
  },

  updateUsername: async (token, username) => {
    return request("/me/username", {
      method: "POST",
      auth: true,
      body: { username: String(username || "").trim() },
    });
  },

  logout: async () => {
    return request("/auth/logout", {
      method: "POST",
    });
  },
};

export default authApi;
