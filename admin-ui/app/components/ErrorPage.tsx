import { useNavigate } from "react-router";
import Button from "~/components/stacks-ui/Button";

type ErrorAction = "home" | "retry" | "login";

interface ErrorCopy {
  title: string;
  message: string;
  action: ErrorAction;
}

/** Status 0 means no response at all, i.e. the server couldn't be reached. */
const ERROR_COPY: Record<number, ErrorCopy> = {
  0: {
    title: "Can't reach the server",
    message:
      "We couldn't connect to The Stacks. Check your internet connection, or the server may be temporarily down.",
    action: "retry",
  },
  400: {
    title: "Bad request",
    message:
      "The request couldn't be understood. Please check it and try again.",
    action: "home",
  },
  401: {
    title: "Not signed in",
    message: "Your session may have expired. Please sign in to continue.",
    action: "login",
  },
  403: {
    title: "Access denied",
    message: "Your account doesn't have permission to view this page.",
    action: "home",
  },
  404: {
    title: "Page not found",
    message:
      "The page you're looking for doesn't exist or may have been moved to a different location.",
    action: "home",
  },
  408: {
    title: "Request timed out",
    message: "The server took too long to respond. Please try again.",
    action: "retry",
  },
  409: {
    title: "Conflict",
    message:
      "This resource was changed by someone else. Reload to see the latest version.",
    action: "retry",
  },
  422: {
    title: "Invalid request",
    message: "Some of the submitted data wasn't valid.",
    action: "home",
  },
  429: {
    title: "Too many requests",
    message: "You're doing that too often. Wait a moment and try again.",
    action: "retry",
  },
  500: {
    title: "Something went wrong",
    message:
      "An unexpected error occurred on our end. Please try again in a moment.",
    action: "retry",
  },
  502: {
    title: "Bad gateway",
    message:
      "The server is unreachable or returned an invalid response. It may be restarting — please try again shortly.",
    action: "retry",
  },
  503: {
    title: "Service unavailable",
    message:
      "The Stacks is temporarily down for maintenance or under heavy load. Please try again shortly.",
    action: "retry",
  },
  504: {
    title: "Gateway timeout",
    message:
      "The server didn't respond in time. It may be down or overloaded — please try again shortly.",
    action: "retry",
  },
};

const CLIENT_ERROR_FALLBACK: ErrorCopy = {
  title: "Request error",
  message: "Something was wrong with that request.",
  action: "home",
};

const SERVER_ERROR_FALLBACK: ErrorCopy = {
  title: "Something went wrong",
  message:
    "An unexpected error occurred on our end. Please try again in a moment.",
  action: "retry",
};

function getErrorCopy(status: number): ErrorCopy {
  return (
    ERROR_COPY[status] ??
    (status >= 400 && status < 500
      ? CLIENT_ERROR_FALLBACK
      : SERVER_ERROR_FALLBACK)
  );
}

interface ErrorPageProps {
  status?: number;
  details?: string;
}

export default function ErrorPage({ status = 404, details }: ErrorPageProps) {
  const navigate = useNavigate();
  const { title, message, action } = getErrorCopy(status);

  return (
    <div className="max-w-container mx-auto flex min-h-svh flex-col items-center justify-center px-6 text-center">
      {status > 0 && (
        <div className="relative mb-8">
          <h1 className="text-carbon-400 relative font-mono text-[120px] leading-none font-light tracking-tighter md:text-[180px]">
            {status}
          </h1>
        </div>
      )}

      <h2 className="text-carbon-400 mb-3 font-serif text-headline-20">
        {title}
      </h2>
      <p className="text-carbon-300 mb-8 max-w-md font-sans text-base font-light md:text-lg">
        {message}
      </p>

      <div className="flex gap-3">
        {action === "retry" && (
          <Button
            className="hover:bg-peach-900/80 w-fit px-4 py-2 text-sm md:text-base"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        )}
        {action === "login" && (
          <Button
            className="hover:bg-peach-900/80 w-fit px-4 py-2 text-sm md:text-base"
            onClick={() => navigate("/login")}
          >
            Sign in
          </Button>
        )}
        <Button
          intent={action === "home" ? "primary" : "secondary"}
          className={
            action === "home"
              ? "hover:bg-peach-900/80 w-fit px-4 py-2 text-sm md:text-base"
              : "w-fit px-4 py-2 text-sm md:text-base"
          }
          onClick={() => navigate("/")}
        >
          Back to home
        </Button>
      </div>

      {details && (
        <pre className="text-carbon-300 mt-10 max-w-full overflow-auto text-left font-mono text-xs">
          {details}
        </pre>
      )}
    </div>
  );
}
