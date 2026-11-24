import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "~/components/stacks-ui/Dropdown";
import {
  INPUT_FIELD_CLASSES,
  ORG_ROLES,
  type OrgRoleValue,
} from "~/lib/constants";
import { cn } from "~/lib/utils";

interface RoleSelectorProps {
  value: OrgRoleValue;
  onChange: (value: OrgRoleValue) => void;
}

export default function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <Dropdown>
      <DropdownTrigger
        className={cn(
          INPUT_FIELD_CLASSES,
          "flex cursor-pointer items-center justify-between"
        )}
      >
        <span>
          {ORG_ROLES.find((r) => r.value === value)?.label ?? "Select role"}
        </span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className="h-4 w-4 shrink-0 text-carbon-300"
          aria-hidden="true"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </DropdownTrigger>
      <DropdownContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] bg-white border-carbon-100 text-foreground"
      >
        {ORG_ROLES.map((r) => (
          <DropdownItem
            key={r.value}
            className="hover:bg-warm-sand-100 focus:bg-warm-sand-100 text-foreground"
            onClick={() => onChange(r.value)}
          >
            {r.label}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
