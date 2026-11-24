import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { assetUrl } from "~/api/utils";
import { cn } from "~/lib/utils";

interface AvatarProps {
  src?: string | null;
  className?: string;
  alt?: string;
}

export default function Avatar(props: AvatarProps) {
  const { src, className, alt } = props;
  const resolvedSrc = assetUrl(src) ?? undefined;

  // First letter of the name passed via `alt`, shown while the image loads or
  // if it is missing / fails to load.
  const fallback = alt?.trim().charAt(0).toUpperCase();

  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex size-9 shrink-0 overflow-hidden rounded-full",
        className
      )}
    >
      <AvatarPrimitive.Image
        src={resolvedSrc}
        alt={alt}
        className="aspect-square size-full object-cover"
        loading="lazy"
        decoding="async"
        fetchPriority="low"
      />
      <AvatarPrimitive.Fallback className="bg-carbon-100 text-caption-20 flex size-full items-center justify-center font-mono uppercase">
        {fallback}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
