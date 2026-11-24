import { z } from "@hono/zod-openapi";

export type NonOwnerUserResponse = {
  id: string;
  username: string;
  email?: string | null;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  profile?: string | null;
  orcid?: string | null;
  iconColor: string;

  // Never really used
  name?: string | null;
  displayUsername?: string | null;

  // Denied fields to non-owners:
  password?: never;
  emailVerified?: never;
  createdAt?: never;
  updatedAt?: never;
  image?: never;
  idInt?: never;
  approved?: never;
  state?: never;
  loginAt?: never;
};

export const NonOwnerUserResponseSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    email: z.email().nullable().optional(),
    firstName: z.string(),
    lastName: z.string(),
    avatar: z.string().nullable().optional(),
    profile: z.string().nullable().optional(),
    orcid: z.string().nullable().optional(),
    iconColor: z.string(),
  })
  .strict();
