import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import Sidebar from "~/components/Sidebar";
import Button from "~/components/stacks-ui/Button";
import { useAuth } from "~/hooks/useAuth";
import type { SessionUser } from "~/lib/authClient";

export function clientLoader() {
  return null;
}

// Access to the admin UI is limited to the users the admin API routes accept:
// site admins, and org admins as `isOrgAdmin` reports them (ACTIVE users with
// a current ADMIN membership in an active org).
function isAuthorizedForAdminUI(user: SessionUser): boolean {
  return user.state === "SITE_ADMIN" || user.isOrgAdmin === true;
}

export default function Layout() {
  const { user, isPending, error, retrySession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const authorized = user ? isAuthorizedForAdminUI(user) : false;

  useEffect(() => {
    if (!isPending && !user && !error) {
      navigate("/login", { replace: true, state: { from: location } });
    } else if (!isPending && user && !authorized) {
      navigate("/unauthorized", { replace: true });
    }
  }, [user, isPending, error, authorized, navigate, location]);

  if (isPending) return null;

  // Couldn't load the session (network/server error, not an expired
  // session) and there's no prior session to fall back on — offer a retry
  // instead of bouncing to /login, since the user may still be signed in.
  if (!user && error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-body-20 mb-4 text-carbon-400">
            Failed to load your account. Please try again.
          </p>
          <Button onClick={retrySession}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!user || !authorized) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="ml-60 flex-1 overflow-x-auto">
        <div className="min-w-[780px] max-w-[1280px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
