import React, { type FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Task } from "@/lib/types";

import {
  type CreateKanbanTaskInput,
  createKanbanTask,
  type KanbanTaskPriority as Priority,
} from "./task-actions";

const NO_PLAN_VALUE = "__no_plan__";

export type NewTaskDialogPlanOption = {
  id: string;
  title: string;
};

export function getNewTaskDialogPlanOptions(
  tasks: ReadonlyArray<Pick<Task, "child_count" | "id" | "parent_task_id" | "title">>,
): NewTaskDialogPlanOption[] {
  return tasks
    .filter((task) => !task.parent_task_id && Number(task.child_count ?? 0) > 0)
    .map((task) => ({
      id: task.id,
      title: task.title,
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function buildNewTaskDialogCreateTaskInput({
  createAsPlan,
  description,
  parentTaskId,
  priority,
  title,
}: {
  createAsPlan: boolean;
  description: string;
  parentTaskId: string;
  priority: Priority;
  title: string;
}): CreateKanbanTaskInput {
  const resolvedParentTaskId = createAsPlan ? undefined : parentTaskId || undefined;

  return {
    description,
    ...(resolvedParentTaskId ? { parentTaskId: resolvedParentTaskId } : {}),
    priority,
    title,
  };
}

type NewTaskDialogProps = {
  plans?: NewTaskDialogPlanOption[];
};

export const NewTaskDialog = ({
  plans = [],
}: NewTaskDialogProps) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [parentTaskId, setParentTaskId] = useState("");
  const [createAsPlan, setCreateAsPlan] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await createKanbanTask(buildNewTaskDialogCreateTaskInput({
        createAsPlan,
        description,
        parentTaskId,
        priority,
        title,
      }));
      setOpen(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("normal");
    setParentTaskId("");
    setCreateAsPlan(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  const handlePlanChange = (value: string) => {
    setParentTaskId(value === NO_PLAN_VALUE ? "" : value);
    if (value !== NO_PLAN_VALUE) {
      setCreateAsPlan(false);
    }
  };

  const handleCreateAsPlanChange = (checked: boolean) => {
    setCreateAsPlan(checked);
    if (checked) {
      setParentTaskId("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-brand">
          <Plus className="h-4 w-4" />
          New
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{createAsPlan ? "Create Plan" : "Create Task"}</DialogTitle>
            <DialogDescription>
              {createAsPlan
                ? "Add a top-level plan to the inbox. Child tasks can be attached later."
                : "Add a new task to the inbox. It will be created by Clawe."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(value: string) => setPriority(value as Priority)}
              >
                <SelectTrigger id="priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="part-of-plan">Part of plan</Label>
              <Select
                disabled={createAsPlan}
                value={parentTaskId || NO_PLAN_VALUE}
                onValueChange={handlePlanChange}
              >
                <SelectTrigger id="part-of-plan">
                  <SelectValue placeholder="No plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PLAN_VALUE}>No plan</SelectItem>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Leave blank to create a standalone task, or attach this task to an existing plan.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="create-as-plan">Create as plan</Label>
                  <p className="text-muted-foreground text-xs">
                    Plans are top-level tasks that can own child tasks.
                  </p>
                </div>
                <input
                  id="create-as-plan"
                  type="checkbox"
                  checked={createAsPlan}
                  onChange={(event) => handleCreateAsPlanChange(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2" />
                  Creating...
                </>
              ) : (
                createAsPlan ? "Create Plan" : "Create Task"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
