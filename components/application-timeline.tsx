import type { ApplicationEvent } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const TITLES: Partial<Record<ApplicationEvent["type"], string>> = {
  created: "Application started",
  submitted: "Submitted",
  stage_completed: "Stage completed",
  completed: "Completed",
  withdrawn: "Withdrawn",
  reopened: "Returned to applicant",
};

/**
 * What actually happened to the application.
 *
 * Email is a notification rather than a step: whether a message was queued or
 * delivered says nothing about where the file is, and three lines of it
 * between every pair of stages buries the history it is meant to explain.
 * Dispatch and delivery are recorded in the audit log, where the question
 * "did that person ever hear about it" is asked.
 */
function isMovement(event: ApplicationEvent): boolean {
  return TITLES[event.type] !== undefined;
}

function dotClass(event: ApplicationEvent, isLast: boolean): string {
  if (event.type === "completed") {
    const ok =
      typeof event.note === "string" && event.note.includes("approved");
    return ok ? "timeline-dot-done" : "timeline-dot-rejected";
  }
  if (event.type === "reopened") return "timeline-dot-rejected";
  if (isLast) return "timeline-dot-current";
  return "timeline-dot-done";
}

export function ApplicationTimeline({
  events: allEvents,
}: {
  events: ApplicationEvent[];
}) {
  const events = allEvents.filter(isMovement);

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
    );
  }

  return (
    <ol className="timeline" data-testid="application-timeline">
      {events.map((event, index) => (
        <li key={event.id} className="timeline-item">
          <span
            className={cn(
              "timeline-dot",
              dotClass(event, index === events.length - 1),
            )}
            aria-hidden
          />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">
              {TITLES[event.type]}
              {event.nodeLabel ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {event.nodeLabel}
                </span>
              ) : null}
            </p>
            {event.outcomeLabel ? (
              <p className="text-sm">Outcome: {event.outcomeLabel}</p>
            ) : null}
            {event.note ? (
              <p className="text-sm text-muted-foreground">{event.note}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {formatter.format(event.createdAt)}
              {event.actorName ? ` · ${event.actorName}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
