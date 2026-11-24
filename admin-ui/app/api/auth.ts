import { toast } from "sonner";
import { authClient } from "~/lib/authClient";

const EMAIL_REGEX = /\S+@\S+\.\S+/;

function isEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

function getAuthErrorMessage(
  error: { message?: string; statusText?: string } | null | undefined,
  fallback: string
): string {
  return error?.message || error?.statusText || fallback;
}

export async function login(
  usernameOrEmail: string,
  password: string
): Promise<void> {
  const { error } = isEmail(usernameOrEmail)
    ? await authClient.signIn.email({ email: usernameOrEmail, password })
    : await authClient.signIn.username({ username: usernameOrEmail, password });

  if (error) {
    throw new Error(getAuthErrorMessage(error, "Login failed"));
  }
}

export async function logout(): Promise<void> {
  try {
    await authClient.signOut();
  } catch {
    // Surface the failure instead of swallowing it, but don't block the
    // caller — Sidebar/Navbar's own try/finally still redirects regardless.
    toast.error("Failed to sign out cleanly. Continuing to log out locally.");
  }
}
