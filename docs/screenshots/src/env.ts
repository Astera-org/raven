import dotenv from "dotenv";
import path from "node:path";

/** docs/screenshots, the package root. */
export const PACKAGE_DIR = path.resolve(import.meta.dirname, "..");

dotenv.config({ path: path.resolve(PACKAGE_DIR, ".env"), quiet: true });

export interface Credentials {
  username: string;
  password: string;
}

export const STACKS_BASE_URL =
  process.env.STACKS_BASE_URL ?? "http://localhost:3005";

export const STACKS_FRONTEND_DIR = path.resolve(
  PACKAGE_DIR,
  process.env.STACKS_FRONTEND_DIR ?? "../../../thestacks.org/frontend"
);

export const BACKEND_URL = "http://localhost:7005";

/** The admin UI, for the Raven docs. Must match BASE_URL_ADMIN in raven.toml. */
export const ADMIN_UI_BASE_URL = "http://localhost:3006";

export const ADMIN_UI_DIR = path.resolve(PACKAGE_DIR, "../../admin-ui");

export const ADMIN: Credentials = {
  username: process.env.SCREENSHOT_ADMIN_USERNAME ?? "admin",
  password:
    process.env.SCREENSHOT_ADMIN_PASSWORD ?? "admin_screenshots_password",
};

export const USER: Credentials = {
  username: process.env.SCREENSHOT_USER_USERNAME ?? "ada",
  password: process.env.SCREENSHOT_USER_PASSWORD ?? "ada_screenshots_password",
};

export const USER_STORAGE_STATE = path.resolve(
  PACKAGE_DIR,
  "playwright/.auth/user.json"
);

export const ADMIN_STORAGE_STATE = path.resolve(
  PACKAGE_DIR,
  "playwright/.auth/admin.json"
);

export const OUT_DIR = path.resolve(PACKAGE_DIR, "out");
