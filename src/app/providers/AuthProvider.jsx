import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { userApi } from "../../entities/user/api/userApi.js";
import { normalizeUser } from "../../entities/user/model/normalizeUser.js";
import { clearAccessTokenRefresh } from "../../shared/api/httpClient.js";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("initializing");
  const [user, setUser] = useState(null);
  useEffect(() => {
    const stored = sessionStorage.getItem("community.user");
    const cached = stored ? JSON.parse(stored) : null;
    const userId = cached?.userId ?? sessionStorage.getItem("userId");
    if (!userId) {
      setStatus("unauthenticated");
      return;
    }
    const controller = new AbortController();
    Promise.all([
      userApi.me({ signal: controller.signal }),
      userApi
        .profileMedia(userId, { signal: controller.signal })
        .catch((error) =>
          error.name === "AbortError" ? Promise.reject(error) : null,
        ),
    ])
      .then(([raw, profile]) => {
        const next = normalizeUser({
          ...cached,
          ...raw,
          ...(profile || {}),
          userId,
        });
        setUser(next);
        setStatus("authenticated");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("unauthenticated");
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const expire = () => {
      setUser(null);
      setStatus("unauthenticated");
    };
    addEventListener("auth:expired", expire);
    return () => removeEventListener("auth:expired", expire);
  }, []);
  const value = useMemo(
    () => ({
      status,
      user,
      authenticate(raw) {
        const next = normalizeUser(raw);
        setUser(next);
        setStatus("authenticated");
        sessionStorage.setItem("community.user", JSON.stringify(next));
        sessionStorage.setItem("userId", String(next.userId));
      },
      clear() {
        clearAccessTokenRefresh({ broadcast: true });
        setUser(null);
        setStatus("unauthenticated");
        sessionStorage.removeItem("community.user");
        sessionStorage.removeItem("userId");
      },
      update(changes) {
        setUser((current) => {
          const next = normalizeUser({ ...current, ...changes });
          sessionStorage.setItem("community.user", JSON.stringify(next));
          return next;
        });
      },
    }),
    [status, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
