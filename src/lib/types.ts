export type AgentStatus = "online" | "offline";

export type TaskStatus = "inbox" | "assigned" | "in_progress" | "review" | "done";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type CommentType = "comment" | "status_change" | "system";

export type SubtaskStatus = "pending" | "in_progress" | "done" | "blocked";

export interface Comment {
  author: string;
  content: string;
  created_at: number;
  id: string;
  task_id: string;
  type: CommentType;
}

export interface Subtask {
  assignee_agent_id: string | null;
  blocked_reason: string | null;
  done: boolean;
  done_at: number | null;
  id: string;
  sort_order: number;
  status: SubtaskStatus;
  task_id: string;
  title: string;
}

export interface TaskRecord {
  assignee_agent_id: string | null;
  completed_at: number | null;
  created_at: number;
  created_by: string | null;
  description: string | null;
  id: string;
  metadata: unknown | null;
  priority: TaskPriority;
  status: TaskStatus;
  title: string;
  updated_at: number;
}

export interface Task extends TaskRecord {
  comments: Comment[];
  subtasks: Subtask[];
}

export interface Agent {
  currentActivity: string | null;
  emoji: string;
  id: string;
  lastHeartbeat: number | null;
  name: string;
  role: string;
  sessionKey: string | null;
  status: AgentStatus;
}

export interface Activity {
  agent_id: string | null;
  created_at: number;
  id: string;
  message: string;
  metadata: unknown | null;
  task_id: string | null;
  type: string;
}
