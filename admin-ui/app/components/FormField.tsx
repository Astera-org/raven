import type { ControllerRenderProps } from "react-hook-form";
import { cn } from "~/lib/utils";

export function FormField({
  id,
  label,
  field,
  maxCharacters,
  multiline,
  rows = 3,
  monospace,
  errorMessage,
  warningMessage,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  field: Omit<ControllerRenderProps, "value"> & { value: string };
  maxCharacters?: number;
  multiline?: boolean;
  rows?: number;
  monospace?: boolean;
  errorMessage?: string;
  warningMessage?: string;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const cls = cn(
    "text-body-20 w-full rounded-lg border border-carbon-100 bg-white px-3 py-2 text-foreground outline-none transition-colors focus:border-carbon-300 disabled:cursor-not-allowed disabled:opacity-50",
    monospace && "font-mono"
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-row justify-between items-center">
        <label
          htmlFor={id}
          className={cn(
            "text-caption-20 font-medium uppercase tracking-widest text-carbon-400",
            monospace && "font-mono"
          )}
        >
          {label}
        </label>
        {maxCharacters && field.value.length >= maxCharacters - 25 && (
          <p
            className={cn(
              "text-caption-20 text-right",
              field.value.length > maxCharacters ? "text-error-900" : ""
            )}
          >
            {field.value.length} / {maxCharacters}
          </p>
        )}
      </div>
      {multiline ? (
        <textarea
          id={id}
          rows={rows}
          value={field.value}
          onChange={(e) => field.onChange(e)}
          onBlur={field.onBlur}
          disabled={disabled}
          className={cn(cls, "resize-none")}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={field.value}
          onChange={(e) => {
            field.onChange(e);
            onChange?.(e);
          }}
          onBlur={field.onBlur}
          disabled={disabled}
          className={cls}
        />
      )}
      <p
        className={cn(
          "text-caption-20 min-h-[1.25rem]",
          errorMessage
            ? "text-error-900"
            : warningMessage
              ? "text-warm-sand-900"
              : "text-carbon-300"
        )}
      >
        {errorMessage ?? warningMessage}
      </p>
    </div>
  );
}
