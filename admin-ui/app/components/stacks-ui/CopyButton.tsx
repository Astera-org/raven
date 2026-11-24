import { Check, Copy } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { toast } from "sonner";
import Button from "~/components/stacks-ui/Button";
import { cn, getErrorMessage } from "~/lib/utils";

const COPIED_FEEDBACK_MS = 2000;

interface CopyButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "onClick" | "asChild"
> {
  text: string;
}

export default function CopyButton(props: CopyButtonProps) {
  const { text, children, className, ...rest } = props;

  const [isCopied, setIsCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(
        () => setIsCopied(false),
        COPIED_FEEDBACK_MS
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to copy to the clipboard."));
    }
  }, [text]);

  return (
    <>
      <Button
        className={cn("gap-1.5", className)}
        onClick={handleCopy}
        {...rest}
      >
        {isCopied ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
        {children}
      </Button>
      {/* Outside the button so it doesn't become part of its accessible name. */}
      <span role="status" className="sr-only">
        {isCopied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
