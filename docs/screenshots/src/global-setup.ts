import { BACKEND_URL } from "./env";

export default async function globalSetup(): Promise<void> {
  const healthURL = `${BACKEND_URL}/api/health`;
  const response = await fetch(healthURL).catch(() => null);
  if (!response?.ok) {
    throw new Error(
      `The screenshot backend is not responding at ${healthURL}. Run \`pnpm backend:up\` in docs/screenshots first.`
    );
  }
}
