import type { CommandUnknownOpts } from "@commander-js/extra-typings";
import { z } from "zod";
import { createApiClient, type ApiClient } from "./api/client.js";
import { tokenForRequest, type AuthLevel } from "./auth-level.js";
import { resolveProfile, type ResolvedProfile } from "./config/profiles.js";
import { Output } from "./output.js";
import type { Runtime } from "./runtime.js";
import { checkStoredSession, rejectedTokenError } from "./session.js";

const GlobalOptionsSchema = z.object({
  profile: z.string().optional(),
  json: z.boolean().default(false),
  anonymous: z.boolean().default(false),
});

export type GlobalOptions = z.infer<typeof GlobalOptionsSchema>;

export interface CommandContext {
  output: Output;
  profile: ResolvedProfile;
  api: ApiClient;
  /** Whether requests carry a token, i.e. the server sees a logged-in user. */
  tokenSent: boolean;
}

export function readGlobalOptions(command: CommandUnknownOpts): GlobalOptions {
  return GlobalOptionsSchema.parse(command.optsWithGlobals());
}

export function createOutput(options: GlobalOptions, runtime: Runtime): Output {
  return new Output(runtime.stdout, runtime.stderr, options.json, runtime.env);
}

/** Global options and output for commands that don't call the v1 API. */
export function createLocalContext(
  command: CommandUnknownOpts,
  runtime: Runtime
): { options: GlobalOptions; output: Output } {
  const options = readGlobalOptions(command);
  return { options, output: createOutput(options, runtime) };
}

export async function createContext(
  command: CommandUnknownOpts,
  authLevel: AuthLevel,
  runtime: Runtime
): Promise<CommandContext> {
  const { options, output } = createLocalContext(command, runtime);
  const profile = await resolveProfile(options, runtime);
  const token = tokenForRequest(authLevel, profile, options.anonymous);
  if (token !== undefined) {
    await checkStoredSession(profile, authLevel, runtime, output);
  }
  return {
    output,
    profile,
    tokenSent: token !== undefined,
    api: createApiClient({
      apiUrl: profile.apiUrl,
      token,
      fetch: runtime.fetch,
      onUnauthorized: () => rejectedTokenError(profile),
    }),
  };
}
