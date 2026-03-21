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
  child_count?: number;
  completed_at: number | null;
  completion_stats?: {
    completed: number;
    total: number;
  };
  created_at: number;
  created_by: string | null;
  description: string | null;
  id: string;
  metadata: unknown | null;
  parent_task_id?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  title: string;
  updated_at: number;
}

export interface Task extends TaskRecord {
  children: TaskRecord[];
  comments: Comment[];
  parent: TaskRecord | null;
  parent_task_id: string | null;
  subtasks: Subtask[];
}

export interface Agent {
  children: string[];
  currentActivity: string | null;
  currentTask: { id: string; title: string; status: string } | null;
  delegatesTo: string[];
  emoji: string;
  id: string;
  lastHeartbeat: number | null;
  name: string;
  parentId: string | null;
  role: string;
  sessionKey: string | null;
  status: AgentStatus;
}

export interface AgentSession {
  agentId: string | null;
  currentActivity: string | null;
  lastHeartbeat: number | null;
  sessionKey: string | null;
  [key: string]: unknown;
}

export interface AgentHierarchyNode {
  agent: Agent;
  children: AgentHierarchyNode[];
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
