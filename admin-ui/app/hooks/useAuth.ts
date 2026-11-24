import { createContext, useContext } from "react";
import type { SessionUser } from "~/lib/authClient";

interface AuthContextValue {
  user: SessionUser | null;
  isPending: boolean;
  error: Error | null;
  retrySession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
};
