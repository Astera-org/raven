import Avatar from "~/components/stacks-ui/Avatar";
import { cn } from "~/lib/utils";

interface UserDisplayUser {
  avatar?: string | null | undefined;
  firstName: string;
  lastName: string;
  username: string;
  email?: string | null;
}

interface UserDisplayProps {
  user: UserDisplayUser;
  size?: "sm" | "md" | "lg";
  showEmail?: boolean;
  className?: string;
}

export default function UserDisplay({
  user,
  size = "md",
  showEmail = false,
  className,
}: UserDisplayProps) {
  const avatarSize =
    size === "sm" ? "size-7" : size === "lg" ? "size-10" : "size-8";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Avatar
        src={user.avatar}
        alt={`${user.firstName} ${user.lastName}`}
        className={cn(avatarSize, "shrink-0")}
      />
      <div>
        <p
          className={cn(
            "text-body-20 text-foreground group-hover:underline",
            size !== "sm" && "font-medium"
          )}
        >
          {user.firstName} {user.lastName}
        </p>
        <p className="text-caption-20 font-mono text-carbon-300">
          @{user.username}
        </p>
        {showEmail && user.email && (
          <p className="text-caption-20 font-mono text-carbon-300 wrap-anywhere">
            {user.email}
          </p>
        )}
      </div>
    </div>
  );
}
