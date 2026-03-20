import { apiPatch, apiPost } from "@/lib/api";

const REVIEW_FEEDBACK_AUTHOR = "operator";
const REVIEW_REWORK_STATUS = "assigned";

export type KanbanTaskPriority = "low" | "normal" | "high" | "urgent";

export async function createKanbanTask({
  description,
  priority,
  title,
}: {
  description: string;
  priority: KanbanTaskPriority;
  title: string;
}) {
  return apiPost("/api/tasks", {
    description: description.trim() || undefined,
    priority,
    title: title.trim(),
  });
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
