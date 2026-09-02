"use client";

import { FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
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
import { formatDate } from "@/lib/format";
import { userTypeLabel } from "@/lib/users/profile";
import { getUserDetail, type UserDetail } from "./actions";
import type { UserRow } from "./users-manager";

/**
 * One account, in full.
 *
 * A row can only carry a name and a couple of badges, and the editor is for
 * changing things rather than reading them. This is the account as a person:
 * what the portal knows about them, what they sign for, and every application
 * they have started - including the draft they have not sent, which is exactly
 * the thing an administrator is asked about.
 */
export function UserDetailDialog({
  user,
  onOpenChange,
  onEdit,
}: {
  /** Null when nothing is open; the dialog is keyed on it by the caller. */
  user: UserRow | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let current = true;

    // Nothing is reset here: the caller keys this dialog on the id, so a
    // different account arrives as a fresh component with empty state.
    void getUserDetail(userId).then((result) => {
      if (!current) return;
      if (result.ok) setDetail(result.data);
      else setError(result.error);
    });

    return () => {
      current = false;
    };
  }, [userId]);

  if (!user) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        data-testid="user-detail"
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {user.name}
            {user.disabled ? (
              <Badge variant="destructive">Disabled</Badge>
            ) : user.activated ? (
              <Badge variant="outline">Active</Badge>
            ) : (
              <Badge variant="secondary">Invited</Badge>
            )}
          </DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        <div className="section-stack">
          <section className="section-stack">
            <h3 className="text-sm font-semibold">The account</h3>
            <dl className="fact-row">
              <Fact label="Employee ID" value={user.employeeId} />
              <Fact label="Designation" value={user.designation} />
              <Fact label="School" value={user.schoolName} />
              <Fact label="Institution" value={user.institution} />
              <Fact
                label="Employment"
                value={user.userType ? userTypeLabel(user.userType) : ""}
              />
              <Fact
                label="Date of birth"
                value={formatDate(user.dateOfBirth)}
              />
              <Fact label="Joined" value={formatDate(user.dateOfJoining)} />
              <Fact
                label="Last promoted"
                value={formatDate(user.dateOfLastPromotion)}
              />
              <Fact label="Contact number" value={user.phone} />
              <Fact label="Personal email" value={user.personalEmail} />
              <Fact label="Address" value={user.address} />
              <Fact
                label="On the whitelist since"
                value={formatDate(user.createdAt)}
              />
            </dl>
          </section>

          <section className="section-stack">
            <h3 className="text-sm font-semibold">Roles and posts</h3>
            <div className="flex flex-wrap gap-1">
              {user.roles.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  No roles. They can sign in and no more.
                </span>
              ) : (
                user.roles.map((role) => (
                  <Badge key={role.id} variant="secondary">
                    {role.name}
                  </Badge>
                ))
              )}
            </div>
            {detail && detail.signsFor.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Signs for: {detail.signsFor.join(", ")}.
              </p>
            ) : null}
          </section>

          <section className="section-stack">
            <h3 className="text-sm font-semibold">Their applications</h3>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : detail === null ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Looking up their applications…
              </p>
            ) : detail.applications.length === 0 ? (
              <div className="empty-state">
                <FileText className="size-6" />
                They have never started an application.
              </div>
            ) : (
              <ul className="record-list" data-testid="user-applications">
                {detail.applications.map((app) => (
                  <li key={app.id} className="record-row">
                    <span className="font-mono text-sm">{app.reference}</span>
                    <StatusBadge status={app.status} />
                    <span className="text-sm text-muted-foreground">
                      {app.status === "draft"
                        ? `Started ${formatDate(app.createdAt)}, not yet sent`
                        : `Submitted ${formatDate(app.submittedAt)}`}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {app.completedAt
                        ? `Decided ${formatDate(app.completedAt)}`
                        : app.stageLabel
                          ? `Now at ${app.stageLabel}`
                          : "In progress"}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/applications/${app.id}`}>View</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onEdit} data-testid="edit-from-detail">
            Edit details and roles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Blank rather than absent: a gap in a record is worth seeing. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt className="fact-label">{label}</dt>
      <dd className="fact-value">{value || "—"}</dd>
    </div>
  );
}
