"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { reorderRoles } from "./actions";
import type { RoleRow } from "./roles-manager";

/**
 * Priority is expressed by dragging rather than by typing numbers: the order
 * on screen *is* the order, and the role at the top is what someone is given
 * when no role is named for them.
 */
export function RolePriorityDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleRow[];
}) {
  const [order, setOrder] = useState(roles);
  const [isSaving, startSave] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((current) => {
      const from = current.findIndex((role) => role.id === active.id);
      const to = current.findIndex((role) => role.id === over.id);
      if (from < 0 || to < 0) return current;
      return arrayMove(current, from, to);
    });
  }

  function handleSave() {
    startSave(async () => {
      const result = await reorderRoles(order.map((role) => role.id));
      if (result.ok) {
        toast.success("Role priority saved.");
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        data-testid="role-priority-dialog"
      >
        <DialogHeader>
          <DialogTitle>Role priority</DialogTitle>
          <DialogDescription>
            Drag to arrange. The role at the top is the default: it is what a
            user is given when an invite or an import names no role.
          </DialogDescription>
        </DialogHeader>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={order.map((role) => role.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-2" data-testid="priority-list">
              {order.map((role, index) => (
                <SortableRole
                  key={role.id}
                  role={role}
                  rank={index + 1}
                  isDefault={index === 0}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            data-testid="save-priority"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableRole({
  role,
  rank,
  isDefault,
}: {
  role: RoleRow;
  rank: number;
  isDefault: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: role.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("priority-row", isDragging && "priority-row-dragging")}
      data-testid={`priority-${role.name}`}
    >
      <button
        type="button"
        className="drag-handle mt-0.5"
        aria-label={`Reorder ${role.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-5 shrink-0 text-sm text-muted-foreground tabular-nums">
        {rank}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{role.name}</span>
        <span className="block text-xs text-muted-foreground">
          {role.memberCount} member{role.memberCount === 1 ? "" : "s"}
        </span>
      </span>

      {isDefault ? <Badge variant="secondary">Default</Badge> : null}
    </li>
  );
}
