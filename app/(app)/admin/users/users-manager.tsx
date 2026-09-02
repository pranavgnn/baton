"use client";

import {
  Loader2,
  MailCheck,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteUser,
  inviteUser,
  resendInvite,
  setUserDisabled,
  updateUser,
} from "./actions";
import { BulkImportDialog } from "./bulk-import";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  schoolId: string;
  schoolName: string;
  designation: string;
  activated: boolean;
  disabled: boolean;
  createdAt: string;
  roles: { id: string; name: string }[];
};

export type RoleOption = { id: string; name: string };
export type SchoolOption = { id: string; name: string };

/** Shown in the school select when someone belongs to no school yet. */
const NO_SCHOOL = "__none__";

export function UsersManager({
  users,
  roles,
  schools,
  currentUserId,
}: {
  users: UserRow[];
  /** In priority order, so the first is the default for unnamed users. */
  roles: RoleOption[];
  schools: SchoolOption[];
  currentUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [inviting, setInviting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);
  const [isBusy, startBusy] = useTransition();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((item) =>
      [item.name, item.email, item.employeeId, item.schoolName]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [users, query]);

  const pagination = usePagination(filtered, 25);

  function runAction(
    label: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    startBusy(async () => {
      const result = await action();
      if (result.ok) toast.success(label);
      else toast.error(result.error ?? "Something went wrong.");
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
            placeholder="Search by name, email, employee ID or school"
            className="pl-8"
            aria-label="Search users"
          />
        </div>
        <div className="toolbar">
          <Button
            variant="outline"
            onClick={() => setImporting(true)}
            data-testid="bulk-import"
          >
            <Upload className="size-4" />
            Import
          </Button>
          <Button onClick={() => setInviting(true)} data-testid="invite-user">
            <UserPlus className="size-4" />
            Add to whitelist
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="empty-state border-0">
                        No users match that search.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.items.map((item) => (
                    <TableRow key={item.id} data-testid={`user-${item.email}`}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              None
                            </span>
                          ) : (
                            item.roles.map((role) => (
                              <Badge key={role.id} variant="secondary">
                                {role.name}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.schoolName || "-"}
                      </TableCell>
                      <TableCell>
                        {item.disabled ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : item.activated ? (
                          <Badge variant="outline">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Invited</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${item.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(item)}>
                              <Pencil className="size-4" />
                              Edit details and roles
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                runAction("Activation link sent.", () =>
                                  resendInvite(item.id),
                                )
                              }
                            >
                              <MailCheck className="size-4" />
                              {item.activated
                                ? "Send password reset"
                                : "Resend activation link"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={item.id === currentUserId}
                              onClick={() =>
                                runAction(
                                  item.disabled
                                    ? "Account re-enabled."
                                    : "Account disabled.",
                                  () =>
                                    setUserDisabled(item.id, !item.disabled),
                                )
                              }
                            >
                              {item.disabled
                                ? "Re-enable access"
                                : "Disable access"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={item.id === currentUserId}
                              onClick={() => setPendingDelete(item)}
                            >
                              <Trash2 className="size-4" />
                              Remove from whitelist
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ListPagination pagination={pagination} label="users" />

      <BulkImportDialog
        open={importing}
        onOpenChange={setImporting}
        defaultRoleName={roles[0]?.name ?? null}
      />

      <UserEditor
        key={editing?.id ?? "invite"}
        open={inviting || Boolean(editing)}
        user={editing}
        roles={roles}
        schools={schools}
        onOpenChange={(open) => {
          if (!open) {
            setInviting(false);
            setEditing(null);
          }
        }}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their access is revoked immediately. Accounts with applications on
              record cannot be removed - disable them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy}
              onClick={(event) => {
                event.preventDefault();
                const target = pendingDelete;
                if (!target) return;
                startBusy(async () => {
                  const result = await deleteUser(target.id);
                  if (result.ok) {
                    toast.success("User removed.");
                    setPendingDelete(null);
                  } else {
                    toast.error(result.error);
                  }
                });
              }}
            >
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Remove user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UserEditor({
  open,
  user,
  roles,
  schools,
  onOpenChange,
}: {
  open: boolean;
  user: UserRow | null;
  roles: RoleOption[];
  schools: SchoolOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [employeeId, setEmployeeId] = useState(user?.employeeId ?? "");
  const [schoolId, setSchoolId] = useState(user?.schoolId || NO_SCHOOL);
  const [designation, setDesignation] = useState(user?.designation ?? "");
  const [roleIds, setRoleIds] = useState<string[]>(
    user?.roles.map((role) => role.id) ?? [],
  );
  const [sendInvite, setSendInvite] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, startSave] = useTransition();

  function handleSave() {
    setFieldErrors({});
    startSave(async () => {
      const base = {
        name,
        employeeId,
        schoolId: schoolId === NO_SCHOOL ? "" : schoolId,
        designation,
        roleIds,
      };
      const result = user
        ? await updateUser(user.id, base)
        : await inviteUser({ ...base, email, sendInvite });

      if (result.ok) {
        toast.success(
          user
            ? "User updated."
            : sendInvite
              ? "User whitelisted and activation link sent."
              : "User whitelisted.",
        );
        onOpenChange(false);
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {user ? "Edit user" : "Add an email to the whitelist"}
          </DialogTitle>
          <DialogDescription>
            {user
              ? "Update their details and the roles that decide what they can do."
              : "Individual or shared departmental addresses both work."}
          </DialogDescription>
        </DialogHeader>

        <div className="form-stack">
          {user ? null : (
            <Field data-invalid={Boolean(fieldErrors.email)}>
              <FieldLabel htmlFor="user-email">Email</FieldLabel>
              <Input
                id="user-email"
                type="email"
                value={email}
                placeholder="hr@manipal.edu"
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              <FieldError errors={[{ message: fieldErrors.email }]} />
            </Field>
          )}

          <Field data-invalid={Boolean(fieldErrors.name)}>
            <FieldLabel htmlFor="user-name">Display name</FieldLabel>
            <Input
              id="user-name"
              value={name}
              placeholder="Dr. Anita Rao"
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            <FieldError errors={[{ message: fieldErrors.name }]} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="user-employee-id">Employee ID</FieldLabel>
              <Input
                id="user-employee-id"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="user-school">School</FieldLabel>
              <Select value={schoolId} onValueChange={setSchoolId}>
                <SelectTrigger id="user-school" data-testid="user-school">
                  <SelectValue placeholder="No school" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SCHOOL}>No school</SelectItem>
                  {schools.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="user-designation">Designation</FieldLabel>
            <Input
              id="user-designation"
              value={designation}
              onChange={(event) => setDesignation(event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel>Roles</FieldLabel>
            <FieldDescription>
              Roles decide which stages this account can act on. Leave them all
              unticked to use the default role.
            </FieldDescription>
            <div className="flex flex-col gap-2">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex items-center gap-2.5 rounded-md border p-2.5 text-sm"
                >
                  <Checkbox
                    checked={roleIds.includes(role.id)}
                    onCheckedChange={(checked) =>
                      setRoleIds((current) =>
                        checked === true
                          ? Array.from(new Set([...current, role.id]))
                          : current.filter((id) => id !== role.id),
                      )
                    }
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </Field>

          {user ? null : (
            <label className="flex items-center gap-2.5 rounded-md border p-2.5 text-sm">
              <Checkbox
                checked={sendInvite}
                onCheckedChange={(checked) => setSendInvite(checked === true)}
              />
              Email the activation link straight away
            </label>
          )}
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
            {user ? "Save changes" : "Add user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
