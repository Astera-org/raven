import { type AdminOrgMemberResponse } from "@raven/backend-ts/types";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import SlidePanel from "~/components/SlidePanel";
import RoleSelector from "~/components/stacks-ui/RoleSelector";
import UserDisplay from "~/components/stacks-ui/UserDisplay";
import { applyApiErrorToForm } from "~/lib/apply-api-error-to-form";
import { FORM_LABEL_CLASSES, INPUT_FIELD_CLASSES } from "~/lib/constants";
import { cn, fromDateInputValue, toDateInputValue } from "~/lib/utils";

interface FormValues {
  role: string;
  startDate: string;
  endDate: string;
}

interface EditMemberPanelProps {
  isOpen: boolean;
  orgSlug: string;
  member: AdminOrgMemberResponse | null;
  onClose: () => void;
  onSaved: () => void;
}
export default function EditMemberPanel({
  isOpen,
  orgSlug,
  member,
  onClose,
  onSaved,
}: EditMemberPanelProps) {
  const {
    control,
    handleSubmit,
    reset: resetForm,
    setValue,
    setError,
    formState: { isSubmitting, isDirty, isValid, errors },
  } = useForm<FormValues>({
    defaultValues: { role: "MEMBER", startDate: "", endDate: "" },
    mode: "onChange",
  });

  const roleValue = useWatch({ control, name: "role" });
  const today = new Date().toLocaleDateString("en-CA");

  useEffect(() => {
    if (member) {
      resetForm({
        role: member.role || "MEMBER",
        startDate: toDateInputValue(member.startAt),
        endDate: toDateInputValue(member.endAt),
      });
    }
  }, [member, resetForm]);

  const onSubmit = handleSubmit(async (values) => {
    if (!member) {
      return;
    }

    const r = await safe(
      apiV1.admin.orgs[":idOrSlug"].members[":memberId"].$patch({
        param: { idOrSlug: orgSlug, memberId: member.userId },
        json: {
          role: values.role === "ADMIN" ? "ADMIN" : "MEMBER",
          startAt: fromDateInputValue(values.startDate),
          endAt: fromDateInputValue(values.endDate),
        },
      })
    );

    if (!r.ok) {
      applyApiErrorToForm(r.error, setError, {
        role: "role",
        startAt: "startDate",
        endAt: "endDate",
      });
      return;
    }

    onClose();
    onSaved();
  });

  const formError = errors.root?.server?.message;
  const canSubmit = isValid && isDirty && !isSubmitting;

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      title="Edit member"
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-body-20 rounded-full border border-carbon-100 px-4 py-2 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground"
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
              {isSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
          <p
            className={cn(
              "text-caption-20 text-right",
              formError ? "text-error-900" : "text-transparent"
            )}
          >
            {formError}
          </p>
        </div>
      }
    >
      {/* Member identity */}
      {member && (
        <UserDisplay
          user={{
            ...member,
          }}
          className="rounded-lg border border-carbon-100 bg-white px-3 py-2.5"
        />
      )}

      {/* Role */}
      <div className="flex flex-col gap-1.5">
        <label className={FORM_LABEL_CLASSES}>Role</label>
        <RoleSelector
          value={roleValue === "ADMIN" ? "ADMIN" : "MEMBER"}
          onChange={(v) => setValue("role", v, { shouldDirty: true })}
        />
        {errors.role?.message && (
          <p className={cn("text-caption-20 text-right text-error-900")}>
            {errors.role?.message}
          </p>
        )}
      </div>

      {/* Start Date */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-start-date" className={FORM_LABEL_CLASSES}>
          Start Date
        </label>
        <Controller
          control={control}
          name="startDate"
          render={({ field }) => (
            <input
              id="edit-start-date"
              type="date"
              value={field.value || today}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              className={cn(
                INPUT_FIELD_CLASSES,
                !field.value && "text-carbon-300"
              )}
            />
          )}
        />
        {errors.startDate?.message && (
          <p className={cn("text-caption-20 text-right text-error-900")}>
            {errors.startDate?.message}
          </p>
        )}
      </div>

      {/* End Date */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="edit-end-date" className={FORM_LABEL_CLASSES}>
            End Date
          </label>
          <button
            type="button"
            onClick={() => setValue("endDate", "", { shouldDirty: true })}
            className="text-caption-20 text-carbon-300 transition-colors hover:text-carbon-400"
          >
            Clear
          </button>
        </div>
        <Controller
          control={control}
          name="endDate"
          render={({ field }) => (
            <input
              id="edit-end-date"
              type="date"
              value={field.value || today}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              className={cn(
                INPUT_FIELD_CLASSES,
                !field.value && "text-carbon-300"
              )}
            />
          )}
        />
        <p className="text-caption-20 text-carbon-300">
          Leave empty for an active member.
        </p>
        {errors.endDate?.message && (
          <p className={cn("text-caption-20 text-right text-error-900")}>
            {errors.endDate?.message}
          </p>
        )}
      </div>
    </SlidePanel>
  );
}
