import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import { FormField } from "~/components/FormField";
import SlidePanel from "~/components/SlidePanel";
import { useSlugAvailability } from "~/hooks/useSlugAvailability";
import { applyApiErrorToForm } from "~/lib/apply-api-error-to-form";
import { cn, getErrorMessage } from "~/lib/utils";
import { type OrgFormValues, orgSchema } from "./EditOrgPanel";
import { Toggle } from "./Toggle";

interface NewOrgPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewOrgPanel({
  isOpen,
  onClose,
  onCreated,
}: NewOrgPanelProps) {
  const {
    control,
    setValue,
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
    mode: "onTouched",
  });

  const slugManuallyEdited = useRef(false);

  const [loading, setLoading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const watchedName = useWatch({ control, name: "name" });
  const watchedSlug = useWatch({ control, name: "slug" });

  const slugWarning = useSlugAvailability(watchedSlug);

  useEffect(() => {
    if (isOpen) {
      slugManuallyEdited.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (slugManuallyEdited.current) return;
    const autoSlug = watchedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setValue("slug", autoSlug, { shouldValidate: true });
  }, [watchedName, setValue]);

  function reset() {
    resetForm();
    setLoading(false);
    setHasInteracted(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const formError = errors.root?.server?.message;

  const onSubmit = handleSubmit(async (values) => {
    setLoading(true);
    clearErrors();
    try {
      const res = await safe(
        apiV1.admin.orgs.$post({
          json: {
            name: values.name,
            slug: values.slug,
            profile: values.profile || null,
            rorId: values.rorId || null,
            doiPrefix: values.doiPrefix || null,
            doiMintingEnabled: values.doiMinting,
            unlisted: values.unlisted,
          },
        })
      );
      if (!res.ok) {
        applyApiErrorToForm(res.error, setError, {
          name: "name",
          slug: "slug",
          profile: "profile",
          rorId: "rorId",
          doiPrefix: "doiPrefix",
        });
        return;
      }
      handleClose();
      onCreated();
    } catch (err: unknown) {
      setError("root.server", {
        type: "server",
        message: getErrorMessage(
          err,
          "Failed to create organization. Please try again."
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
      title="New organization"
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
              {loading ? "Creating…" : "Create organization"}
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
            id="org-name"
            label="Name"
            field={field}
            errorMessage={hasInteracted ? errors.name?.message : undefined}
            onChange={() => setHasInteracted(true)}
          />
        )}
      />
      <Controller
        control={control}
        name="slug"
        render={({ field }) => (
          <FormField
            id="org-slug"
            label="Slug"
            field={field}
            errorMessage={hasInteracted ? errors.slug?.message : undefined}
            warningMessage={
              !errors.slug?.message ? (slugWarning ?? undefined) : undefined
            }
            onChange={(e) => {
              if (e.target.value !== "") {
                slugManuallyEdited.current = true;
              }
            }}
          />
        )}
      />
      <Controller
        control={control}
        name="profile"
        render={({ field }) => (
          <FormField
            id="org-profile"
            label="Profile"
            field={field}
            multiline
            errorMessage={errors.profile?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="rorId"
        render={({ field }) => (
          <FormField
            id="org-ror"
            label="ROR"
            field={field}
            errorMessage={errors.rorId?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="doiPrefix"
        render={({ field }) => (
          <FormField
            id="org-doi-prefix"
            label="DOI Suffix Prefix"
            field={field}
            errorMessage={errors.doiPrefix?.message}
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
