import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("unauthorized", "routes/unauthorized.tsx"),
  layout("routes/_layout.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("orgs", "routes/orgs.tsx"),
    route("orgs/:slug", "routes/orgs.$slug.tsx"),
    route("publications", "routes/publications.tsx"),
    route("publications/:slug", "routes/publications.$slug.tsx"),
    route(
      "publications/:slug/versions/:versionNumber",
      "routes/publications.$slug.versions.$versionNumber.tsx"
    ),
    route("users", "routes/users.tsx"),
    route("users/:id", "routes/users.$id.tsx"),
    route("doi-audit", "routes/doi-audit.tsx"),
    route(
      "doi-audit/compare/:type/:doi",
      "routes/doi-audit.compare.$type.$doi.tsx"
    ),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
