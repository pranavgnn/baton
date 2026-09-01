import type { ApplicationEvent } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const TITLES: Record<ApplicationEvent["type"], string> = {
  created: "Application started",
  submitted: "Submitted",
  stage_completed: "Stage completed",
  email_queued: "Email queued",
  email_sent: "Email sent",
  email_failed: "Email failed",
  completed: "Completed",
  withdrawn: "Withdrawn",
  reopened: "Returned to applicant",
};

function dotClass(event: ApplicationEvent, isLast: boolean): string {
  if (event.type === "email_failed") return "timeline-dot-rejected";
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
  events,
}: {
  events: ApplicationEvent[];
}) {
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
