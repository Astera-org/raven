import { useCallback } from "react";
import { Link, NavLink } from "react-router";
import { logout } from "~/api/auth";
import TheStacksAdminLogo from "~/components/icons/TheStacksAdminLogo";
import Avatar from "~/components/stacks-ui/Avatar";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "~/components/stacks-ui/Dropdown";
import type { SessionUser } from "~/lib/authClient";

// The layout only renders the sidebar for site admins and org admins.
function getUserRole(user: SessionUser): string {
  return user.state === "SITE_ADMIN" ? "Site Admin" : "Org Admin";
}

const NAV_LINKS = [
  { to: "/orgs", label: "Organizations" },
  { to: "/publications", label: "Publications" },
  { to: "/users", label: "Users" },
  { to: "/doi-audit", label: "DOI Metadata" },
];

export default function Sidebar({ user }: { user: SessionUser }) {
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      window.location.replace("/");
    }
  }, []);

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-60 flex-col border-r border-carbon-100 bg-white">
      {/* Logo */}
      <div className="px-5 py-5">
        <Link to="/dashboard" aria-label="Admin dashboard">
          <TheStacksAdminLogo className="h-10 w-auto text-gray-blue-900" />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2">
        <p className="text-caption-20 mb-2 px-2 font-mono tracking-widest text-carbon-200">
          MANAGE
        </p>
        <ul className="flex flex-col gap-0.5">
          {NAV_LINKS.map(({ to, label }) => (
            <li key={to}>
              <NavLink to={to}>
                {({ isActive }) => (
                  <span
                    className={`flex items-center gap-2.5 rounded px-2 py-2 transition-colors ${
                      isActive
                        ? "bg-warm-sand-300 text-foreground"
                        : "text-carbon-400 hover:bg-warm-sand-300 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`block h-2 w-2 shrink-0 ${
                        isActive
                          ? "rounded-none bg-carbon-400"
                          : "rounded-full bg-carbon-200"
                      }`}
                    />
                    <span
                      className={`text-body-20 ${isActive ? "font-semibold" : ""}`}
                    >
                      {label}
                    </span>
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t border-carbon-100">
        <Dropdown modal={false}>
          <DropdownTrigger className="flex w-full items-center gap-3 px-4 py-4 transition-colors hover:bg-warm-sand-100">
            <Avatar
              src={user.image}
              alt={`${user.firstName} ${user.lastName}`}
              className="size-9 shrink-0"
            />
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <span className="text-body-20 truncate font-semibold text-foreground">
                {user.firstName} {user.lastName}
              </span>
              <span className="text-caption-40 text-carbon-300">
                {getUserRole(user)}
              </span>
            </div>
            <svg
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-carbon-300 transition-transform [[data-state=open]_&]:rotate-180"
            >
              <path
                d="M4 10L8 6L12 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </DropdownTrigger>

          <DropdownContent side="top" align="center" className="w-52">
            <DropdownItem onClick={handleLogout}>Log out</DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </aside>
  );
}
