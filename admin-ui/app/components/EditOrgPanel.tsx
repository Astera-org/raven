import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import { FormField } from "~/components/FormField";
import SlidePanel from "~/components/SlidePanel";
import { useSlugAvailability } from "~/hooks/useSlugAvailability";
import { applyApiErrorToForm } from "~/lib/apply-api-error-to-form";
import { cn, getErrorMessage } from "~/lib/utils";
import type { Organization } from "~/types";
import { Toggle } from "./Toggle";

export const orgSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .refine((value) => /^[a-z0-9-]+$/.test(value), {
      message: "Slug may only contain lowercase letters, numbers, and hyphens",
    }),
  profile: z.string(),
  rorId: z.string(),
  doiPrefix: z.string(),
  doiMinting: z.boolean(),
  unlisted: z.boolean(),
});

export type OrgFormValues = z.infer<typeof orgSchema>;

interface EditOrgPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (finalSlug: string) => void;
  org: Organization;
}

export default function EditOrgPanel({
  isOpen,
  onClose,
  onSaved,
  org,
}: EditOrgPanelProps) {
  const {
    control,
    handleSubmit,
    reset: resetForm,
    setError,
    clearErrors,
    trigger,
    formState: { errors, isValid, isSubmitting, isDirty },
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      name: "",
      slug: "",
      profile: "",
      rorId: "",
      doiPrefix: "",
      doiMinting: false,
      unlisted: false,
    },
    mode: "onChange",
  });

  const [loading, setLoading] = useState(false);

  const watchedSlug = useWatch({ control, name: "slug" });

  const slugWarning = useSlugAvailability(watchedSlug, org.slug);

  useEffect(() => {
    resetForm({
      name: org.name,
      slug: org.slug,
      profile: org.profile || "",
      rorId: org.rorId || "",
      doiPrefix: org.doiPrefix || "",
      doiMinting: Boolean(org.doiMintingEnabled),
      unlisted: Boolean(org.unlisted),
    });
  }, [org, resetForm]);

  function handleClose() {
    clearErrors();
    resetForm({
      name: org.name,
      slug: org.slug,
      profile: org.profile || "",
      rorId: org.rorId || "",
      doiPrefix: org.doiPrefix || "",
      doiMinting: Boolean(org.doiMintingEnabled),
      unlisted: Boolean(org.unlisted),
    });
    onClose();
  }

  const formError = errors.root?.server?.message;

  const onSubmit = handleSubmit(async (values) => {
    setLoading(true);
    clearErrors();
    try {
      const res = await safe(
        apiV1.admin.orgs[":idOrSlug"].$patch({
          param: { idOrSlug: org.id },
          json: {
            name: values.name,
            profile: values.profile || null,
            rorId: values.rorId || null,
            doiPrefix: values.doiPrefix || null,
            doiMintingEnabled: values.doiMinting,
            unlisted: values.unlisted,
            slug: values.slug,
          },
        })
      );
      if (res.ok) {
        const data = await res.data;
        onSaved(data.slug);
        handleClose();
      } else {
        applyApiErrorToForm(res.error, setError, {
          name: "name",
          profile: "profile",
          rorId: "rorId",
          doiPrefix: "doiPrefix",
          doiMintingEnabled: "doiMinting",
          unlisted: "unlisted",
          slug: "slug",
        });
      }
    } catch (err: unknown) {
      setError("root.server", {
        type: "server",
        message: getErrorMessage(
          err,
          "Failed to save organization. Please try again."
        ),
      });
    } finally {
      setLoading(false);
    }
  });

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      isDirty={isDirty}
      title="Edit organization"
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              className="text-body-20 rounded-full border border-carbon-100 px-4 py-2 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              disabled={!isValid || loading || isSubmitting}
              onClick={onSubmit}
              className={cn(
                "text-body-20 rounded-full px-5 py-2 transition-colors",
                isValid && !loading && !isSubmitting
                  ? "bg-gray-blue-900 text-white"
                  : "cursor-not-allowed bg-carbon-100 text-carbon-300"
              )}
            >
              {loading ? "Saving…" : "Save changes"}
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
        name="name"
        render={({ field }) => (
          <FormField
            id="edit-org-name"
            label="Name"
            field={field}
            maxCharacters={255}
            errorMessage={errors.name?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="slug"
        render={({ field }) => (
          <FormField
            id="edit-org-slug"
            label="Slug"
            field={field}
            errorMessage={errors.slug?.message}
            maxCharacters={255}
            warningMessage={
              !errors.slug?.message ? (slugWarning ?? undefined) : undefined
            }
          />
        )}
      />
      <Controller
        control={control}
        name="profile"
        render={({ field }) => (
          <FormField
            id="edit-org-profile"
            label="Profile"
            field={field}
            multiline
          />
        )}
      />
      <Controller
        control={control}
        name="rorId"
        render={({ field }) => (
          <FormField id="edit-org-ror" label="ROR" field={field} />
        )}
      />
      <Controller
        control={control}
        name="doiPrefix"
        render={({ field }) => (
          <FormField
            id="edit-org-doi-prefix"
            label="DOI Suffix Prefix"
            field={field}
            errorMessage={errors.doiPrefix?.message}
            maxCharacters={50}
          />
        )}
      />
      <Controller
        control={control}
        name="doiMinting"
        render={({ field }) => (
          <Toggle
            label="DOI Minting"
            description="Issue DOIs for this org's publications"
            checked={field.value}
            onChange={() => {
              field.onChange(!field.value);
              trigger("doiPrefix");
            }}
          />
        )}
      />
      <Controller
        control={control}
        name="unlisted"
        render={({ field }) => (
          <Toggle
            label="Unlisted"
            description="Hide this org from public directories"
            checked={field.value}
            onChange={() => field.onChange(!field.value)}
          />
        )}
      />
    </SlidePanel>
  );
}
