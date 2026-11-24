import { Link } from "react-router";
import TheStacksLogo from "~/components/icons/TheStacksLogo";

export default function Footer() {
  return (
    <footer className="text-body-20 bg-gray-blue-700 text-off-white py-10">
      <div className="max-w-container container:px-0 mx-auto px-4">
        <div className="flex flex-col items-start gap-10 md:flex-row md:items-center md:justify-between">
          <Link to="/" aria-label="Home">
            <TheStacksLogo className="h-auto w-20 md:w-30" />
          </Link>
          <div className="flex flex-col items-start gap-10 md:items-end md:gap-5">
            <nav aria-label="Footer">
              <ul className="flex flex-col gap-3 md:flex-row md:gap-6">
                {/* TODO: Add these pages and uncomment these links.
                <li>
                  <Link
                    to="/about"
                    className="hover:underline hover:underline-offset-4"
                  >
                    About
                  </Link>
                </li> 
                */}
              </ul>
            </nav>
            <div>
              © {new Date().getFullYear()} Astera Institute. All rights
              reserved.
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
