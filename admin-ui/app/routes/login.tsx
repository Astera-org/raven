import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { login } from "~/api/auth";
import Button from "~/components/stacks-ui/Button";
import { useAuth } from "~/hooks/useAuth";

export function clientLoader() {
  return null;
}

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  if (user) return null;

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      // Hard reload so Better Auth's freshly-set session cookie (and this
      // provider's derived state) is picked up from scratch, rather than
      // relying on client-side session propagation timing.
      const from = (
        location.state as {
          from?: { pathname?: string; search?: string; hash?: string };
        } | null
      )?.from;
      const redirectTo = from?.pathname
        ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`
        : "/dashboard";
      window.location.replace(redirectTo);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center bg-gray-300 p-8">
      <div className="w-full max-w-sm rounded-lg border border-carbon-100 bg-white p-8">
        <h1 className="font-serif text-headline-20 mb-6 text-foreground">
          Log in
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="username"
              className="text-body-20 font-medium text-carbon-400"
            >
              Username or email
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="text-body-20 w-full rounded border border-carbon-100 bg-white px-3 py-2 text-foreground outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-body-20 font-medium text-carbon-400"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-body-20 w-full rounded border border-carbon-100 bg-white px-3 py-2 text-foreground outline-none"
            />
          </div>

          {error !== null && (
            <p className="text-body-20 text-error-900">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
