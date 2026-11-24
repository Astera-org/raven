import { createMiddleware } from "hono/factory";
import type {
  ClientErrorStatusCode,
  ServerErrorStatusCode,
} from "hono/utils/http-status";

type ErrorStatusCode = ClientErrorStatusCode | ServerErrorStatusCode;

export type JsonErrorsParams = [
  errors: Record<string, string[]>,
  statusCode: ErrorStatusCode,
];

// 1. Define the type for your custom methods
export type JsonErrorsContext = {
  jsonErrors: (...params: JsonErrorsParams) => Response;
};

// 2. Create middleware that injects the method
export const jsonErrorsMiddleware = createMiddleware<{
  Variables: JsonErrorsContext;
}>(async (c, next) => {
  c.set(
    "jsonErrors",
    (errors: Record<string, string[]>, statusCode: ErrorStatusCode) => {
      return c.json({ errors }, statusCode);
    }
  );
  await next();
});
