import { useCallback } from "react";
import { logout } from "~/api/auth";
import Button from "~/components/stacks-ui/Button";

export default function Unauthorized() {
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      window.location.replace("/");
    }
  }, []);

  return (
    <div className="max-w-container mx-auto flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <h2 className="text-carbon-400 mb-3 font-serif text-headline-20">
        Not authorized
      </h2>
      <p className="text-carbon-300 mb-8 max-w-md font-sans text-base font-light md:text-lg">
        Your account does not have access to the admin UI.
      </p>

      <Button
        className="hover:bg-peach-900/80 w-fit px-4 py-2 text-sm md:text-base"
        onClick={handleLogout}
      >
        Log out
      </Button>
    </div>
  );
}
