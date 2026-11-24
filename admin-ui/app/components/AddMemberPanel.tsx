import { type NonOwnerUserResponse } from "@raven/backend-ts/types";
import dayjs from "dayjs";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import SlidePanel from "~/components/SlidePanel";
import RoleSelector from "~/components/stacks-ui/RoleSelector";
import UserSearch from "~/components/stacks-ui/UserSearch";
import { applyApiErrorToForm } from "~/lib/apply-api-error-to-form";
import {
  FORM_LABEL_CLASSES,
  INPUT_FIELD_CLASSES,
  type ORG_ROLES,
} from "~/lib/constants";
import { cn, fromDateInputValue } from "~/lib/utils";

interface FormValues {
  endDate: string | null;
  role: (typeof ORG_ROLES)[number]["value"];
  startDate: string | null;
  username: string;
}

interface AddMemberPanelProps {
  isOpen: boolean;
  orgSlug: string;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddMemberPanel({
  isOpen,
  orgSlug,
  onClose,
  onAdded,
}: AddMemberPanelProps) {
  // Uses the browser's date not UTC
  const today = dayjs().format("YYYY-MM-DD");
  const {
    control,
    handleSubmit,
    reset: resetForm,
    setValue,
    setError,
    clearErrors,
    formState: { isSubmitting, isDirty, errors },
  } = useForm<FormValues>({
    defaultValues: {
      role: "MEMBER",
      startDate: today,
      endDate: null,
      username: "",
    },
    mode: "onChange",
  });

  const roleValue = useWatch({ control, name: "role" });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<NonOwnerUserResponse | null>(
    null
  );

  function reset() {
    resetForm();
    setSelectedUser(null);
    setSearchQuery("");
  }

  function selectUser(user: NonOwnerUserResponse | null) {
    setSelectedUser(user);
    setValue("username", user?.username ?? "", { shouldDirty: true });
    clearErrors("username");
  }

  function handleClose() {
    reset();
    onClose();
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!values.username) {
      return;
    }

    const r = await safe(
      apiV1.admin.orgs[":idOrSlug"].members.$post({
        param: { idOrSlug: orgSlug },
        json: {
          username: values.username,
          isAdmin: values.role === "ADMIN",
          startAt: fromDateInputValue(values.startDate),
          endAt: fromDateInputValue(values.endDate),
        },
      })
    );

    if (!r.ok) {
      applyApiErrorToForm(r.error, setError, {
        username: "username",
        isAdmin: "role",
        startAt: "startDate",
        endAt: "endDate",
      });
      return;
    }

    handleClose();
    onAdded();
  });

  const formError = errors.root?.server?.message;
  const canSubmit = !!selectedUser && !isSubmitting;

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      isDirty={isDirty}
      title="Add member"
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
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
              {isSubmitting ? "Adding…" : "Add member"}
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
      {/* User search */}
      <UserSearch
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedUser={selectedUser}
        onSelect={selectUser}
        onClear={() => selectUser(null)}
        error={errors.username?.message}
      />

      {/* Role */}
      <div className="flex flex-col gap-1.5">
        <label className={FORM_LABEL_CLASSES}>Role</label>
        <RoleSelector
          value={roleValue}
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
              value={field.value || ""}
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
