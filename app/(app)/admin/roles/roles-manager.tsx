"use client";

import {
  ArrowUpDown,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ROLE_DESIGNATIONS,
  designationLabel,
  type RoleDesignation,
} from "@/lib/auth/designations";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  SUPER_ADMIN_PERMISSION,
  type PermissionKey,
} from "@/lib/auth/permissions";
import { createRole, deleteRole, updateRole } from "./actions";
import { RoleDetailDialog } from "./role-detail";
import { RolePriorityDialog } from "./role-priority";

export type RoleRow = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  /** Rank in the list, lowest first. The lowest is the default role. */
  priority: number;
  isSystem: boolean;
  memberCount: number;
  /** A key from `lib/auth/designations`, or "" for an ordinary role. */
  designation: string;
};

/** The human labels of the permissions a role holds, for searching. */
function permissionLabels(permissions: string[]): string[] {
  return permissions.map(
    (key) => PERMISSIONS.find((entry) => entry.key === key)?.label ?? key,
  );
}

/** Radix forbids an empty item value, so "no post" carries a sentinel. */
const NO_DESIGNATION = "none";

type EditorState = {
  open: boolean;
  role: RoleRow | null;
};

export function RolesManager({ roles }: { roles: RoleRow[] }) {
  // The list arrives in priority order, so the first row is the default.
  const defaultRoleId = roles[0]?.id ?? null;

  const [editor, setEditor] = useState<EditorState>({
    open: false,
    role: null,
  });
  const [viewing, setViewing] = useState<RoleRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RoleRow | null>(null);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return roles;
    return roles.filter((item) =>
      [item.name, item.description, ...permissionLabels(item.permissions)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [roles, query]);

  const pagination = usePagination(filtered, 25);

  function handleDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    startDelete(async () => {
      const result = await deleteRole(target.id);
      if (result.ok) {
        toast.success(`Deleted "${target.name}".`);
        setPendingDelete(null);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="toolbar justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, description or permission"
            className="pl-8"
            aria-label="Search roles"
          />
        </div>
        <div className="toolbar">
          <Button
            variant="outline"
            onClick={() => setPriorityOpen(true)}
            data-testid="open-role-priority"
          >
            <ArrowUpDown className="size-4" />
            Set priority
          </Button>
          <Button
            onClick={() => setEditor({ open: true, role: null })}
            data-testid="new-role"
          >
            <Plus className="size-4" />
            New role
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-right">#</TableHead>
                <TableHead className="min-w-[14rem]">Role</TableHead>
                <TableHead className="w-44">Stands for</TableHead>
                <TableHead className="w-24 text-center">Members</TableHead>
                <TableHead className="w-28 text-center">Permissions</TableHead>
                <TableHead className="w-24 pr-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="empty-state border-0">
                      No roles match that search.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pagination.items.map((item) => (
                  <TableRow key={item.id} data-testid={`role-${item.name}`}>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {item.priority + 1}
                    </TableCell>
                    <TableCell>
                      {/* The whole role opens from its name: what it grants
                          and who holds it are a click away rather than
                          spread across the row. */}
                      <button
                        type="button"
                        className="row-opener w-full text-left"
                        onClick={() => setViewing(item)}
                        data-testid={`open-role-${item.name}`}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          {item.name}
                          {item.id === defaultRoleId ? (
                            <Badge title="Given to users when no role is named">
                              Default
                            </Badge>
                          ) : null}
                        </span>
                        <span className="line-clamp-1 max-w-sm text-xs whitespace-normal text-muted-foreground">
                          {item.description || "No description."}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {item.designation
                        ? designationLabel(item.designation)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {item.memberCount}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground tabular-nums">
                      {item.permissions.includes(SUPER_ADMIN_PERMISSION)
                        ? "All"
                        : item.permissions.length}
                    </TableCell>
                    <TableCell className="pr-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${item.name}`}
                          onClick={() => setEditor({ open: true, role: item })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {item.isSystem ? null : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            aria-label={`Delete ${item.name}`}
                            onClick={() => setPendingDelete(item)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ListPagination pagination={pagination} label="roles" />

      {/* Keyed so reopening starts from the saved order, not a stale draft. */}
      <RolePriorityDialog
        key={priorityOpen ? "open" : "closed"}
        open={priorityOpen}
        onOpenChange={setPriorityOpen}
        roles={roles}
      />

      {/* Keyed so a second role opens with its own members, not the first's. */}
      <RoleDetailDialog
        key={viewing?.id ?? "none"}
        role={viewing}
        isDefault={viewing?.id === defaultRoleId}
        onOpenChange={(open) => !open && setViewing(null)}
        onEdit={() => {
          setEditor({ open: true, role: viewing });
          setViewing(null);
        }}
      />

      <RoleEditor
        key={editor.role?.id ?? "new"}
        open={editor.open}
        role={editor.role}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{pendingDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Roles still assigned to users or to a
              workflow stage cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RoleEditor({
  open,
  role,
  onOpenChange,
}: {
  open: boolean;
  role: RoleRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(
    role?.permissions ?? [],
  );
  const [designation, setDesignation] = useState<RoleDesignation | "">(
    (role?.designation ?? "") as RoleDesignation | "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, startSave] = useTransition();

  const isSuper = role?.permissions.includes(SUPER_ADMIN_PERMISSION) ?? false;

  function toggle(key: PermissionKey, checked: boolean) {
    setPermissions((current) =>
      checked
        ? Array.from(new Set([...current, key]))
        : current.filter((value) => value !== key),
    );
  }

  function handleSave() {
    setFieldErrors({});
    startSave(async () => {
      const payload = {
        name,
        description,
        designation,
        permissions: permissions.filter(
          (value): value is PermissionKey => value !== SUPER_ADMIN_PERMISSION,
        ),
      };
      const result = role
        ? await updateRole(role.id, payload)
        : await createRole(payload);

      if (result.ok) {
        toast.success(role ? "Role updated." : "Role created.");
        onOpenChange(false);
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? "Edit role" : "New role"}</DialogTitle>
          <DialogDescription>
            Give the role a name your reviewers will recognise, then grant the
            capabilities it needs.
          </DialogDescription>
        </DialogHeader>

        <div className="form-stack">
          <Field data-invalid={Boolean(fieldErrors.name)}>
            <FieldLabel htmlFor="role-name">Name</FieldLabel>
            <Input
              id="role-name"
              value={name}
              placeholder="e.g. Deputy"
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            <FieldError errors={[{ message: fieldErrors.name }]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="role-description">Description</FieldLabel>
            <Textarea
              id="role-description"
              value={description}
              rows={2}
              placeholder="What this role is responsible for"
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="role-designation">Stands for</FieldLabel>
            <Select
              value={designation || NO_DESIGNATION}
              onValueChange={(value) =>
                setDesignation(
                  value === NO_DESIGNATION ? "" : (value as RoleDesignation),
                )
              }
            >
              <SelectTrigger id="role-designation" data-testid="designation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DESIGNATION}>
                  Nothing in particular
                </SelectItem>
                {ROLE_DESIGNATIONS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {ROLE_DESIGNATIONS.find((item) => item.key === designation)
                ?.description ??
                "Naming a post here is what lets the portal grant this role by itself. Only one role may stand for each."}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Permissions</FieldLabel>
            {isSuper ? (
              <FieldDescription>
                The Super Admin role always holds every permission and cannot be
                narrowed.
              </FieldDescription>
            ) : (
              <div className="flex flex-col gap-4">
                {PERMISSION_GROUPS.map((group) => {
                  const inGroup = PERMISSIONS.filter((p) => p.group === group);
                  const held = inGroup.filter((p) =>
                    permissions.includes(p.key),
                  ).length;

                  return (
                    <div key={group} className="flex flex-col gap-2">
                      <p className="flex items-center justify-between text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {group}
                        <span className="tabular-nums">
                          {held} of {inGroup.length}
                        </span>
                      </p>
                      {/* Two abreast: the whole vocabulary then fits without
                          the dialog becoming a scroll. */}
                      <div className="grid gap-2 sm:grid-cols-2">
                        {inGroup.map((permission) => (
                          <label
                            key={permission.key}
                            className="flex items-start gap-2.5 rounded-md border p-2.5"
                          >
                            <Checkbox
                              checked={permissions.includes(permission.key)}
                              onCheckedChange={(checked) =>
                                toggle(permission.key, checked === true)
                              }
                            />
                            <span className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">
                                {permission.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {permission.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Field>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            {role ? "Save changes" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
