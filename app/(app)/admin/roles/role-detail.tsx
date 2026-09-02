"use client";

import { Loader2, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import { designationLabel } from "@/lib/auth/designations";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  SUPER_ADMIN_PERMISSION,
} from "@/lib/auth/permissions";
import { listRoleMembers, type RoleMember } from "./actions";
import type { RoleRow } from "./roles-manager";

/**
 * One role, in full.
 *
 * The table says what a role is; this says what it means - every permission it
 * grants, spelled out, and every person who currently holds it. Both were what
 * made the table itself unreadable when they were shown inline, and both are
 * only ever wanted one role at a time.
 */
export function RoleDetailDialog({
  role,
  isDefault,
  onOpenChange,
  onEdit,
}: {
  /** Null when nothing is open; the dialog is keyed on it by the caller. */
  role: RoleRow | null;
  isDefault: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const [members, setMembers] = useState<RoleMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roleId = role?.id ?? null;

  useEffect(() => {
    if (!roleId) return;
    let current = true;

    // Nothing is reset here: the caller keys this dialog on the id, so a
    // different role arrives as a fresh component with empty state.
    void listRoleMembers(roleId).then((result) => {
      if (!current) return;
      if (result.ok) setMembers(result.data);
      else setError(result.error);
    });

    return () => {
      current = false;
    };
  }, [roleId]);

  const granted = useMemo(() => {
    if (!role) return [];
    return PERMISSION_GROUPS.map((group) => ({
      group,
      held: PERMISSIONS.filter(
        (entry) =>
          entry.group === group && role.permissions.includes(entry.key),
      ),
    })).filter((entry) => entry.held.length > 0);
  }, [role]);

  if (!role) return null;
  const isSuper = role.permissions.includes(SUPER_ADMIN_PERMISSION);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        data-testid="role-detail"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {role.name}
            {isDefault ? <Badge>Default</Badge> : null}
            {role.isSystem ? <Badge variant="secondary">System</Badge> : null}
          </DialogTitle>
          <DialogDescription>
            {role.description || "No description."}
          </DialogDescription>
        </DialogHeader>

        <div className="section-stack">
          <dl className="fact-row">
            <Fact label="Priority" value={String(role.priority + 1)} />
            <Fact
              label="Stands for"
              value={
                role.designation
                  ? designationLabel(role.designation)
                  : "Nothing in particular"
              }
            />
            <Fact label="Members" value={String(role.memberCount)} />
          </dl>

          <section className="section-stack">
            <h3 className="text-sm font-semibold">What it can do</h3>
            {isSuper ? (
              <p className="text-sm text-muted-foreground">
                Every permission there is, including any added later.
              </p>
            ) : granted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing. Holders of this role can sign in and no more.
              </p>
            ) : (
              granted.map(({ group, held }) => (
                <div key={group} className="flex flex-col gap-1">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {group}
                  </p>
                  <ul className="permission-list">
                    {held.map((entry) => (
                      <li key={entry.key}>
                        <span className="text-sm font-medium">
                          {entry.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <section className="section-stack">
            <h3 className="text-sm font-semibold">Who holds it</h3>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : members === null ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Looking up the members…
              </p>
            ) : (
              <MemberList members={members} />
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onEdit} data-testid="edit-from-detail">
            Edit this role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberList({ members }: { members: RoleMember[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      [member.name, member.email, member.employeeId, member.schoolName]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [members, query]);

  const pagination = usePagination(filtered, 10);

  if (members.length === 0) {
    return (
      <div className="empty-state">
        <Users className="size-6" />
        Nobody holds this role yet.
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the members"
          className="pl-8"
          aria-label="Search the members of this role"
          data-testid="member-search"
        />
      </div>

      <ul className="record-list" data-testid="role-members">
        {pagination.items.length === 0 ? (
          <li className="empty-state border-0">Nobody matches that search.</li>
        ) : (
          pagination.items.map((member) => (
            <li key={member.id} className="record-row">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {member.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {member.email}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                {member.schoolName || "—"}
              </span>
              {member.disabled ? (
                <Badge variant="destructive">Disabled</Badge>
              ) : null}
              {/* Straight to that person's own record, opened for reading. */}
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/admin/users?person=${encodeURIComponent(member.email)}`}
                >
                  Open
                </Link>
              </Button>
            </li>
          ))
        )}
      </ul>

      <ListPagination pagination={pagination} label="members" />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt className="fact-label">{label}</dt>
      <dd className="fact-value">{value}</dd>
    </div>
  );
}
