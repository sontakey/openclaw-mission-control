import { apiPatch, apiPost } from "@/lib/api";

const REVIEW_FEEDBACK_AUTHOR = "operator";
const REVIEW_REWORK_STATUS = "assigned";

export type KanbanTaskPriority = "low" | "normal" | "high" | "urgent";
export type CreateKanbanTaskInput = {
  description: string;
  parentTaskId?: string;
  priority: KanbanTaskPriority;
  title: string;
};

export function buildCreateKanbanTaskPayload({
  description,
  parentTaskId,
  priority,
  title,
}: CreateKanbanTaskInput) {
  const trimmedDescription = description.trim();
  const trimmedTitle = title.trim();

  return {
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    ...(parentTaskId ? { parent_task_id: parentTaskId } : {}),
    priority,
    title: trimmedTitle,
  };
}

export async function createKanbanTask({
  description,
  parentTaskId,
  priority,
  title,
}: CreateKanbanTaskInput) {
  return apiPost("/api/tasks", buildCreateKanbanTaskPayload({
    description,
    parentTaskId,
    priority,
    title,
  }));
}

export async function approveKanbanTask(taskId: string) {
  return apiPatch(`/api/tasks/${taskId}`, {
    status: "done",
  });
}

export async function requestKanbanTaskChanges(
  taskId: string,
  feedback: string,
) {
  const content = feedback.trim();

  if (!content) {
    return null;
  }

  await apiPost(`/api/tasks/${taskId}/comments`, {
    author: REVIEW_FEEDBACK_AUTHOR,
    content,
  });

  return apiPatch(`/api/tasks/${taskId}`, {
    status: REVIEW_REWORK_STATUS,
  });
}
