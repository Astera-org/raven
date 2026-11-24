import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import stylesheet from "~/../styles/index.css?url";
import { ApiError, firstErrorMessage } from "~/api/api-error";
import ErrorPage from "~/components/ErrorPage";
import { KeyboardFocusMode } from "~/components/KeyboardFocusMode";
import { Toaster } from "~/components/ui/sonner";
import AuthProvider from "~/providers/AuthProvider";
import { type Route } from "./+types/root";

const queryClient = new QueryClient();

export const links = () => [
  // Main stylesheet.
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  // TODO: apple-touch-icon
  // { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  // Preload fonts.
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&display=swap",
  },
];

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error)) {
    return <ErrorPage status={error.status} />;
  } else if (error instanceof ApiError) {
    const details = firstErrorMessage(error);
    return <ErrorPage status={error.status} details={details} />;
  }

  return (
    <ErrorPage
      status={500}
      details={
        import.meta.env.DEV && (error as unknown) instanceof Error
          ? (error as Error).stack
          : undefined
      }
    />
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="generator" content="The Stacks Admin" />
        <title>The Stacks Admin</title>

        <Meta />
        <Links />
      </head>

      <body suppressHydrationWarning>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <KeyboardFocusMode />
            <div>{children}</div>
            <Toaster
              richColors
              theme="light"
              position="bottom-right"
              offset={48}
            />
          </AuthProvider>
        </QueryClientProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
