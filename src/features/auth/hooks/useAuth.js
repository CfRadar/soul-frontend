import { useState, useEffect, useCallback } from "react";
import { authApi } from "../api/authApi";
import { getToken, setToken as persistToken } from "../../../api/client";
import { setSocketToken } from "../../../socket";

export function useAuth() {
  const [token, setTokenState] = useState(() => getToken());
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialChecking, setInitialChecking] = useState(Boolean(getToken()));
  const [error, setError] = useState("");

  // Validate existing token on mount
  useEffect(() => {
    const existingToken = getToken();
    if (!existingToken) {
      setInitialChecking(false);
      return;
    }

    let isMounted = true;
    authApi
      .getMe(existingToken)
      .then((res) => {
        if (!isMounted) return;
        if (res?.ok && res.player) {
          setMe(res.player);
          setTokenState(existingToken);
          setSocketToken(existingToken);
        } else {
          persistToken("");
          setTokenState("");
          setSocketToken("");
          setMe(null);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        persistToken("");
        setTokenState("");
        setSocketToken("");
        setMe(null);
      })
      .finally(() => {
        if (isMounted) setInitialChecking(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async ({ email, password }) => {
    setLoading(true);
    setError("");
    try {
      const res = await authApi.login({ email, password });
      if (!res?.ok) {
        const errorMsg =
          res?.error === "user_not_found"
            ? "Account not found. Please sign up."
            : res?.error === "invalid_password"
            ? "Invalid password."
            : res?.error === "account_has_no_password"
            ? "This account was created with OTP. Please sign up or contact support."
            : res?.error || "Login failed.";
        throw new Error(errorMsg);
      }

      persistToken(res.token);
      setTokenState(res.token);
      setSocketToken(res.token);
      setMe(res.player);
      return res;
    } catch (err) {
      const msg = err.message || "An error occurred during login.";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async ({ email, password, username }) => {
    setLoading(true);
    setError("");
    try {
      const res = await authApi.signup({ email, password, username });
      if (!res?.ok) {
        const errorMsg =
          res?.error === "email_taken"
            ? "Email is already registered."
            : res?.error === "username_taken"
            ? "Username is already taken."
            : res?.error === "password_too_short"
            ? "Password must be at least 6 characters."
            : res?.error === "invalid_username"
            ? "Username must be 3-16 alphanumeric characters or underscores."
            : res?.error || "Sign up failed.";
        throw new Error(errorMsg);
      }

      persistToken(res.token);
      setTokenState(res.token);
      setSocketToken(res.token);
      setMe(res.player);
      return res;
    } catch (err) {
      const msg = err.message || "An error occurred during sign up.";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    authApi.logout().catch(() => {});
    persistToken("");
    setTokenState("");
    setSocketToken("");
    setMe(null);
    setError("");
  }, []);

  const updateUsername = useCallback(
    async (newUsername) => {
      if (!token) throw new Error("Not authenticated");
      const res = await authApi.updateUsername(token, newUsername);
      if (res?.ok && res.player) {
        setMe(res.player);
        return res.player;
      }
      throw new Error(res?.error || "Failed to update username");
    },
    [token]
  );

  return {
    token,
    me,
    setMe,
    loading,
    initialChecking,
    error,
    setError,
    login,
    signup,
    logout,
    updateUsername,
    isAuthenticated: Boolean(token && me),
  };
}

export default useAuth;
