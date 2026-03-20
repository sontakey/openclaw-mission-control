import type { Response } from "express";

type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type SseRecord = Record<string, JsonValue>;

export type SseEventMap = {
  activity: { activity: SseRecord };
  agent_status: { agents: SseRecord[] };
  comment_added: { comment: SseRecord; taskId: string };
  task_created: { task: SseRecord };
  task_deleted: { taskId: string };
  task_updated: { task: SseRecord };
};

export type SseEventType = keyof SseEventMap;

export type SseEvent = {
  [EventType in SseEventType]: { type: EventType } & SseEventMap[EventType];
}[SseEventType];

export type SseClient = Pick<Response, "setHeader" | "write"> &
  Partial<Pick<Response, "flushHeaders" | "status">>;

export class SseBroadcastManager {
  private readonly clients = new Set<SseClient>();

  addClient(response: SseClient) {
    response.status?.(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();
    response.write(": connected\n\n");
    this.clients.add(response);
  }

  removeClient(response: SseClient) {
    this.clients.delete(response);
  }

  broadcast<EventType extends SseEventType>(event: EventType, data: SseEventMap[EventType]) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const client of this.clients) {
      client.write(message);
    }
  }
}

export const sse = new SseBroadcastManager();
