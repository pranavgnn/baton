import {
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";

import type { ApplicationStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const META: Record<
  ApplicationStatus,
  {
    label: string;
    className: string;
    icon: ComponentType<{ className?: string }>;
  }
> = {
  draft: { label: "Draft", className: "status-draft", icon: CircleDashed },
  in_progress: {
    label: "In progress",
    className: "status-in_progress",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    className: "status-approved",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    className: "status-rejected",
    icon: XCircle,
  },
  withdrawn: {
    label: "Withdrawn",
    className: "status-withdrawn",
    icon: CircleSlash,
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  const meta = META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn("status-pill", meta.className, className)}
      data-testid={`status-${status}`}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

export function statusLabel(status: ApplicationStatus): string {
  return META[status].label;
}
