import type {
  AdminPublicationResponse,
  AdminUpdatePublicationBody,
} from "@raven/backend-ts/types";
import { type RefObject, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { ApiValidationError, safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import { FormField } from "~/components/FormField";
import Button from "~/components/stacks-ui/Button";
import Dialog from "~/components/stacks-ui/Dialog";
import { applyApiErrorToForm } from "~/lib/apply-api-error-to-form";
import { formatJson } from "~/lib/utils";

interface FormValues {
  doiMetadata: string;
}

function toFormValues(
  doiMetadata: AdminPublicationResponse["doiMetadata"]
): FormValues {
  return { doiMetadata: formatJson(doiMetadata) };
}

/**
 * The API reports each schema issue at its path inside the body, e.g.
 * `doiMetadata.content.language`. They all belong to the one textarea, so
 * each is labelled with its path below `doiMetadata`.
 */
function doiMetadataIssueMessage(error: ApiValidationError): string {
  return error.issues
    .map(({ path, message }) => {
      const subPath = (path[0] === "doiMetadata" ? path.slice(1) : path).join(
        "."
      );
      return subPath ? `${subPath}: ${message}` : message;
    })
    .join(" ");
}

interface EditDoiMetadataDialogProps {
  open: boolean;
  publication: AdminPublicationResponse;
  onClose: () => void;
  onSaved: () => Promise<void>;
  /**
   * Gets focus back when the dialog closes. It opens from a menu item, which
   * is gone by then, rather than from a Radix trigger Radix could return to.
   */
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export default function EditDoiMetadataDialog({
  open,
  publication,
  onClose,
  onSaved,
  returnFocusRef,
}: EditDoiMetadataDialogProps) {
  const {
    control,
    handleSubmit,
    reset: resetForm,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    defaultValues: toFormValues(publication.doiMetadata),
  });

  useEffect(() => {
    resetForm(toFormValues(publication.doiMetadata));
  }, [publication.doiMetadata, resetForm]);

  // Every way of closing the dialog lands here, so returning early keeps it
  // open until the in-flight PATCH settles.
  function handleClose() {
    if (isSubmitting) return;
    resetForm(toFormValues(publication.doiMetadata));
    onClose();
  }

  const onSubmit = handleSubmit(async (values) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(values.doiMetadata);
    } catch (error) {
      setError("doiMetadata", {
        type: "validate",
        message:
          error instanceof SyntaxError
            ? `Not valid JSON: ${error.message}`
            : "Not valid JSON.",
      });
      return;
    }

    // Only the API knows the DOI metadata schema; it rejects a value that
    // doesn't match with a 422, which lands on this field below.
    const doiMetadata = parsed as AdminUpdatePublicationBody["doiMetadata"];
    const r = await safe(
      apiV1.admin.publications[":idOrSlug"].$patch({
        param: { idOrSlug: publication.id },
        json: { doiMetadata },
      })
    );
    if (!r.ok) {
      if (r.error instanceof ApiValidationError) {
        setError("doiMetadata", {
          type: "server",
          message: doiMetadataIssueMessage(r.error),
        });
      } else {
        applyApiErrorToForm(r.error, setError, {});
      }
      return;
    }

    try {
      await onSaved();
    } catch {
      // The PATCH succeeded, so only refreshing the page failed.
      setError("root.server", {
        type: "server",
        message:
          "Saved, but the page couldn't refresh. Reload it to see the change.",
      });
    }
  });

  const formError = errors.root?.server?.message;
  const canSubmit = isDirty && !isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && handleClose()}
      title="Edit metadata configuration"
      description="Changes apply to this publication's metadata configuration."
      isDirty={isDirty}
      className="max-w-2xl"
      onCloseAutoFocus={(event) => {
        if (!returnFocusRef.current) return;
        event.preventDefault();
        returnFocusRef.current.focus();
      }}
      footer={
        <>
          <Button
            size="sm"
            intent="secondary"
            disabled={isSubmitting}
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={onSubmit}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Controller
        control={control}
        name="doiMetadata"
        render={({ field }) => (
          <FormField
            id="edit-doi-metadata"
            label="Configuration"
            field={field}
            multiline
            rows={16}
            monospace
            errorMessage={errors.doiMetadata?.message}
            disabled={isSubmitting}
          />
        )}
      />
      {formError && (
        <p role="alert" className="text-caption-20 text-error-900">
          {formError}
        </p>
      )}
    </Dialog>
  );
}
