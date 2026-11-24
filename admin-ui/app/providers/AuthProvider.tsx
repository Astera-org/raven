import type { ReactNode } from "react";
import { useCallback } from "react";
import { AuthContext } from "~/hooks/useAuth";
import { authClient } from "~/lib/authClient";

export default function AuthProvider({ children }: { children: ReactNode }) {
  // The admin UI's `/get-session` carries its permissions (see authClient),
  // so the session is the whole profile. useSession keeps the last user on a
  // transient failure and clears it on a 401, and follows sign-ins in other
  // tabs.
  const { data: session, isPending, error, refetch } = authClient.useSession();

  const retrySession = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, isPending, error, retrySession }}
    >
      {children}
    </AuthContext.Provider>
  );
}
