import type {
  AdminUpdateUserBody,
  AdminUserResponse,
} from "@raven/backend-ts/types";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import { FormField } from "~/components/FormField";
import SlidePanel from "~/components/SlidePanel";
import { Toggle } from "~/components/Toggle";
import { applyApiErrorToForm } from "~/lib/apply-api-error-to-form";
import { cn } from "~/lib/utils";

interface FormValues {
  email: string;
  orcid: string;
  emailVerified: boolean;
}

function toFormValues(user: AdminUserResponse): FormValues {
  return {
    email: user.email ?? "",
    orcid: user.orcid ?? "",
    emailVerified: user.emailVerified,
  };
}

interface EditUserPanelProps {
  isOpen: boolean;
  user: AdminUserResponse;
  onClose: () => void;
  onSaved: (user: AdminUserResponse) => void;
}

export default function EditUserPanel({
  isOpen,
  user,
  onClose,
  onSaved,
}: EditUserPanelProps) {
  const {
    control,
    handleSubmit,
    reset: resetForm,
    setError,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<FormValues>({ defaultValues: toFormValues(user) });

  useEffect(() => {
    resetForm(toFormValues(user));
  }, [user, resetForm]);

  // Every way of closing the panel lands here, so returning early keeps it
  // open until the in-flight PATCH settles.
  function handleClose() {
    if (isSubmitting) return;
    resetForm(toFormValues(user));
    onClose();
  }

  // Only changed fields are sent, so saving the verification toggle alone
  // works for a user who has no email on record.
  const onSubmit = handleSubmit(async (values) => {
    const json: AdminUpdateUserBody = {};
    if (dirtyFields.email) json.email = values.email.trim();
    if (dirtyFields.orcid) json.orcid = values.orcid.trim() || null;
    if (dirtyFields.emailVerified) json.emailVerified = values.emailVerified;

    const r = await safe(
      apiV1.admin.users[":id"].$patch({ param: { id: user.id }, json })
    );
    if (!r.ok) {
      // Toggle can't show an error, so an emailVerified issue falls through
      // to the footer message.
      applyApiErrorToForm(r.error, setError, {
        email: "email",
        orcid: "orcid",
      });
      return;
    }

    onSaved(r.data);
  });

  const formError = errors.root?.server?.message;
  const canSubmit = isDirty && !isSubmitting;

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      isDirty={isDirty}
      title="Edit user"
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-body-20 rounded-full border border-carbon-100 px-4 py-2 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className={cn(
                "text-body-20 rounded-full px-5 py-2 transition-colors",
                canSubmit
                  ? "bg-gray-blue-900 text-white"
                  : "cursor-not-allowed bg-carbon-100 text-carbon-300"
              )}
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </button>
          </div>
          {formError && (
            <p className="text-caption-20 text-right text-error-900">
              {formError}
            </p>
          )}
        </div>
      }
    >
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <FormField
            id="edit-user-email"
            label="Email"
            field={field}
            maxCharacters={255}
            errorMessage={errors.email?.message}
            disabled={isSubmitting}
          />
        )}
      />
      <Controller
        control={control}
        name="orcid"
        render={({ field }) => (
          <FormField
            id="edit-user-orcid"
            label="ORCID iD"
            field={field}
            errorMessage={errors.orcid?.message}
            disabled={isSubmitting}
          />
        )}
      />
      <Controller
        control={control}
        name="emailVerified"
        render={({ field }) => (
          <Toggle
            label="Email verified"
            description="Whether the user has confirmed this email address"
            checked={field.value}
            disabled={isSubmitting}
            onChange={() => field.onChange(!field.value)}
          />
        )}
      />
    </SlidePanel>
  );
}
