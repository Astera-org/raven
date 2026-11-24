import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import {
  type ApiError,
  ApiHttpError,
  ApiValidationError,
} from "~/api/api-error";

/**
 * Puts API errors onto react-hook-form fields.
 * fieldMap keys are the API's field paths (issue.path joined with "."),
 * values are the form's field names. Anything unmapped goes to root.server.
 */
export function applyApiErrorToForm<T extends FieldValues>(
  e: ApiError,
  setError: UseFormSetError<T>,
  fieldMap: Partial<Record<string, Path<T>>>,
  fallback = "Something went wrong. Please try again."
) {
  const unmapped: string[] = [];
  const put = (apiPath: string, message: string) => {
    const field = fieldMap[apiPath];
    if (field) setError(field, { type: "server", message });
    else unmapped.push(message);
  };

  if (e instanceof ApiValidationError) {
    for (const issue of e.issues) put(issue.path.join("."), issue.message);
  } else if (e instanceof ApiHttpError) {
    for (const [key, { message }] of Object.entries(e.errors)) {
      if (message) put(key, message);
    }
  } else {
    unmapped.push(fallback);
  }

  if (unmapped.length) {
    setError("root.server", { type: "server", message: unmapped.join(" ") });
  }
}
