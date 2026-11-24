import { type NonOwnerUserResponse } from "@raven/backend-ts/types";
import { useEffect, useRef, useState } from "react";
import { firstErrorMessage, safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import UserDisplay from "~/components/stacks-ui/UserDisplay";
import { FORM_LABEL_CLASSES, INPUT_FIELD_CLASSES } from "~/lib/constants";
import { cn } from "~/lib/utils";

interface UserSearchProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onSelect: (user: NonOwnerUserResponse) => void;
  onClear: () => void;
  selectedUser: NonOwnerUserResponse | null;
  error?: string;
  placeholder?: string;
  className?: string;
}

export default function UserSearch({
  searchQuery,
  onSearchQueryChange,
  onSelect,
  onClear,
  selectedUser,
  error,
  placeholder,
  className,
}: UserSearchProps) {
  const [searchResults, setSearchResults] = useState<NonOwnerUserResponse[]>(
    []
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounced search.
  useEffect(() => {
    const shouldSearch = !!searchQuery.trim() && !selectedUser;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        if (!shouldSearch) {
          setSearchResults([]);
          setSearching(false);
          setShowDropdown(false);
          return;
        }
        setSearchError(null);
        const r = await safe(
          apiV1.users.$get(
            { query: { q: searchQuery } },
            { init: { signal: controller.signal } }
          )
        );
        if (controller.signal.aborted) return;
        if (r.ok) {
          setSearchResults(r.data.items.slice(0, 6));
          setShowDropdown(r.data.items.length > 0);
        } else {
          setSearchError(
            firstErrorMessage(r.error, "Search failed. Please try again.")
          );
        }
        setSearching(false);
      },
      shouldSearch ? 300 : 0
    );
    // This one is safe beause no effect lists searching as a dependency
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, selectedUser]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(user: NonOwnerUserResponse) {
    setShowDropdown(false);
    setSearchResults([]);
    setSearchError(null);
    onSelect(user);
  }

  function handleClear() {
    onSearchQueryChange("");
    setSearchResults([]);
    setShowDropdown(false);
    setSearchError(null);
    onClear();
    searchInputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor="edit-end-date" className={FORM_LABEL_CLASSES}>
          User
        </label>
        {searching && searchQuery && (
          <p className="text-caption-20 text-carbon-300">Searching…</p>
        )}
      </div>

      <div className={cn(className)} ref={dropdownRef}>
        <div className="relative">
          <input
            id="user-search-input"
            ref={searchInputRef}
            type="text"
            autoComplete="off"
            value={
              selectedUser
                ? `${selectedUser.firstName} ${selectedUser.lastName} (@${selectedUser.username})`
                : searchQuery
            }
            placeholder={placeholder}
            onChange={(e) => {
              onSearchQueryChange(e.target.value);
              if (selectedUser) onClear();
            }}
            onFocus={() => {
              if (searchResults.length > 0 && !selectedUser)
                setShowDropdown(true);
            }}
            className={`${INPUT_FIELD_CLASSES} pr-8`}
          />
          {selectedUser && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-carbon-300 transition-colors hover:text-foreground"
              aria-label="Clear selected user"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path
                  d="M3 3L13 13M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}

          {showDropdown && (
            <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-carbon-100 bg-white shadow-lg">
              {searchResults.map((user) => (
                <li key={user.username}>
                  <button
                    type="button"
                    onClick={() => handleSelect(user)}
                    className="w-full px-3 py-2.5 text-left transition-colors hover:bg-warm-sand-100"
                  >
                    <UserDisplay user={user} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(searchError || error) && (
          <p className="text-caption-20 mt-1 text-error-900">
            {searchError ?? error}
          </p>
        )}

        {selectedUser && (
          <div className="min-h-[3.75rem]">
            <UserDisplay
              user={selectedUser}
              className="rounded-lg border border-carbon-100 bg-white px-3 py-2.5"
            />
          </div>
        )}
      </div>
    </div>
  );
}
