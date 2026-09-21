// client/src/api.js
import { API_URL, getToken, request } from "./api/client";
import { authApi } from "./features/auth/api/authApi";

export { API_URL, getToken, request };

/* -----------------------------
   AUTH (Password/Email + Username)
----------------------------- */
export const login = authApi.login;
export const signup = authApi.signup;
export const getMe = authApi.getMe;
export const updateUsername = authApi.updateUsername;

/* -----------------------------
   FRIENDS
----------------------------- */
export const friendsApi = {
  list: () => request("/friends/list", { auth: true }),
  requests: () => request("/friends/requests", { auth: true }),
  requestByUid: (uid) =>
    request("/friends/request", { method: "POST", auth: true, body: { uid } }),
  accept: (uid) =>
    request("/friends/accept", { method: "POST", auth: true, body: { uid } }),
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
  return request("/bosses/unlocks", { auth: true });
}

export async function unlockBoss(token, bossId) {
  return request("/bosses/unlock", {
    method: "POST",
    auth: true,
    body: { bossId },
  });
}
