import { Link } from "react-router";
import TheStacksLogo from "~/components/icons/TheStacksLogo";
import Button from "~/components/stacks-ui/Button";

export default function Navbar() {
  return (
    <header className="bg-off-white h-navbar fixed top-0 right-0 left-0 z-100 flex items-center transition-transform duration-300 ease-out">
      <div className="max-w-container mx-auto flex w-full items-center justify-between px-4 md:px-8">
        {/* Logo. */}
        <Link to="/" aria-label="Home">
          <TheStacksLogo className="text-gray-blue-900 h-auto w-20 md:w-30" />
        </Link>

        {/* Navbar is used on the logged-out home page; signed-in users are redirected
            to /dashboard once their profile has been loaded. */}
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
