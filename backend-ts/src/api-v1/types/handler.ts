import { type AppEnv } from "#src/types/hono.js";
import {
  type createRoute,
  type RouteConfigToEnv,
  type RouteConfigToTypedResponse,
  type RouteHandler,
} from "@hono/zod-openapi";
import { type Env } from "hono";

type Route = ReturnType<typeof createRoute>;

/**
 * Every v1 route is mounted on an `OpenAPIHono<AppEnv>`, so handlers always
 * see `AppEnv`, plus whatever the route's own middleware adds (e.g.
 * `AuthEnv` from `requireAuth`).
 */
type RouteEnv<T extends Route> = AppEnv & RouteConfigToEnv<T>;

type HandlerType<T extends Route, E extends Env = RouteEnv<T>> = RouteHandler<
  T,
  E
>;

export type HandlerArgs<
  T extends Route,
  E extends Env = RouteEnv<T>,
> = Parameters<HandlerType<T, E>>;

export type HandlerContext<
  T extends Route,
  E extends Env = RouteEnv<T>,
> = HandlerArgs<T, E>[0];

export type HandlerNext<
  T extends Route,
  E extends Env = RouteEnv<T>,
> = HandlerArgs<T, E>[1];

export type HandlerReturnType<T extends Route> = Promise<
  RouteConfigToTypedResponse<T> &
    // TypedResponse does not inherently include Response but `JSONRespondReturn` from
    // hono's context does include it
    Response
>;
