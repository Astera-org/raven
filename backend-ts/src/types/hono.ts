import {
  type AuthContext,
  type MaybeAuthContext,
} from "#src/lib/middleware/auth-context.js";
import { type JsonErrorsContext } from "#src/lib/middleware/json-error.js";
import { type JsonValidationErrorsContext } from "#src/lib/middleware/validation-errors.js";
import { type Logger } from "pino";

export type BaseAppEnv = {
  Variables: { logger: Logger } & JsonErrorsContext &
    JsonValidationErrorsContext;
};

export type AppEnv = {
  Variables: BaseAppEnv["Variables"] & MaybeAuthContext;
};

export type AuthEnv = {
  Variables: BaseAppEnv["Variables"] & AuthContext;
};
