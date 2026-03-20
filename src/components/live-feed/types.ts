import type { Activity, Agent, TaskRecord } from "@/lib/types";

export type ActivityType = Activity["type"];

export type FeedActivity = Activity & {
  _id: string;
  agent?: Pick<Agent, "emoji" | "name"> | null;
  createdAt: number;
  task?: Pick<TaskRecord, "title"> | null;
};

export type FeedFilter = "all" | "tasks" | "status" | "heartbeats";
