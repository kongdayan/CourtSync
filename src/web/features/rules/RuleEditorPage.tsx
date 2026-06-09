import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { apiFetch, apiPost, apiPatch, ApiError } from "../../lib/api";
import { RuleForm, type RuleFormData } from "./RuleForm";
import { HOURLY_TIMESLOTS } from "@shared/sources";

interface RuleResponse {
  id: string;
  userId: string;
  name: string;
  source: string;
  weekdayMask: number;
  timeslotMask: number;
  facilityIds: string[];
  minConsecutive: number;
  pushLimit: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function maskToWeekdays(mask: number): number[] {
  const days: number[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) days.push(i + 1);
  }
  return days;
}

function maskToTimeslots(mask: number): string[] {
  const slots: string[] = [];
  for (let i = 0; i < HOURLY_TIMESLOTS.length; i++) {
    if (mask & (1 << i)) slots.push(HOURLY_TIMESLOTS[i].start);
  }
  return slots;
}

export function RuleEditorPage() {
  const { ruleId } = useParams<{ ruleId: string }>();
  const navigate = useNavigate();
  const isEditing = !!ruleId;

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* Fetch existing rule when editing */
  const {
    data: existingRule,
    isLoading: ruleLoading,
    error: ruleError,
  } = useQuery<RuleResponse>({
    queryKey: ["rule", ruleId],
    queryFn: () => apiFetch(`/rules/${ruleId}`),
    enabled: isEditing,
    retry: false,
  });

  /* Convert rule response to form data */
  const initialData: Partial<RuleFormData> | undefined = existingRule
    ? {
        name: existingRule.name,
        source: existingRule.source as RuleFormData["source"],
        weekdays: maskToWeekdays(existingRule.weekdayMask),
        facilityIds: existingRule.facilityIds,
        timeslots: maskToTimeslots(existingRule.timeslotMask),
        minConsecutive: existingRule.minConsecutive,
        pushLimit: existingRule.pushLimit,
        enabled: existingRule.enabled,
      }
    : undefined;

  /* Submit handler */
  const handleSubmit = async (data: RuleFormData) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const body = {
        name: data.name,
        source: data.source,
        weekdays: data.weekdays,
        facilityIds: data.facilityIds,
        timeslots: data.timeslots,
        minConsecutive: data.minConsecutive,
        pushLimit: data.pushLimit,
        enabled: data.enabled,
      };

      if (isEditing) {
        await apiPatch(`/rules/${ruleId}`, body);
      } else {
        await apiPost("/rules", body);
      }

      navigate("/rules");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "rule_limit_reached") {
          setSubmitError("已达到规则上限");
        } else if (err.code === "validation_error") {
          setSubmitError("输入数据有误，请检查后重试");
        } else {
          setSubmitError(err.code);
        }
      } else {
        setSubmitError("保存失败，请重试");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate("/rules");
  };

  /* Loading state for existing rule */
  if (isEditing && ruleLoading) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  /* Error loading existing rule */
  if (isEditing && ruleError) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <p className="text-red-500">规则加载失败</p>
        <button
          onClick={() => navigate("/rules")}
          className="mt-4 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-xl font-bold">
          {isEditing ? "编辑规则" : "新建规则"}
        </h1>
      </header>

      {/* Submit error */}
      {submitError && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      {/* Form */}
      <div className="rounded-lg border border-gray-200 p-6">
        {isEditing && existingRule ? (
          <RuleForm
            key={existingRule.id}
            initialData={initialData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            onCancel={handleCancel}
          />
        ) : !isEditing ? (
          <RuleForm
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            onCancel={handleCancel}
          />
        ) : null}
      </div>
    </div>
  );
}
