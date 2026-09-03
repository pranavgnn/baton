"use client";

import {
  ArrowLeft,
  Eye,
  FileText,
  Loader2,
  MailCheck,
  Pencil,
  Shield,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { USER_TYPES, userTypeLabel, type UserType } from "@/lib/users/profile";
import {
  deleteUser,
  impersonateUser,
  resendInvite,
  updateUser,
} from "@/app/(app)/admin/users/actions";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";

import type { ApplicationStatus } from "@/lib/db/schema";

export type UserProfileData = {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  schoolId: string;
  schoolName: string;
  designation: string;
  institution: string;
  userType: string;
  dateOfBirth: string;
  dateOfJoining: string;
  dateOfLastPromotion: string;
  phone: string;
  personalEmail: string;
  address: string;
  activated: boolean;
  disabled: boolean;
  createdAt: string;
  roles: { id: string; name: string }[];
  signsFor: string[];
  applications: {
    id: string;
    reference: string;
    status: ApplicationStatus;
    stageLabel: string;
    createdAt: string;
    submittedAt: string | null;
    completedAt: string | null;
  }[];
};

export type RoleOption = { id: string; name: string };
export type SchoolOption = { id: string; name: string };

const NO_SCHOOL = "__none__";
const NO_USER_TYPE = "__unset__";

function broadcastUserUpdate() {
  try {
    const channel = new BroadcastChannel("portal_users");
    channel.postMessage({ type: "users_updated" });
    channel.close();
  } catch {
    // BroadcastChannel not available
  }
  try {
    localStorage.setItem("portal_users_updated", String(Date.now()));
  } catch {
    // localStorage not available
  }
}

export function UserProfileView({
  user,
  allRoles,
  allSchools,
  canManage,
  currentUserId,
}: {
  user: UserProfileData;
  allRoles: RoleOption[];
  allSchools: SchoolOption[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEdit = searchParams.get("edit") === "true";

  const [mode, setMode] = useState<"view" | "edit">(
    initialEdit && canManage ? "edit" : "view",
  );

  // Edit form state
  const [name, setName] = useState(user.name);
  const [employeeId, setEmployeeId] = useState(user.employeeId);
  const [schoolId, setSchoolId] = useState(user.schoolId || NO_SCHOOL);
  const [designation, setDesignation] = useState(user.designation);
  const [institution, setInstitution] = useState(user.institution);
  const [userType, setUserType] = useState<UserType | "">(
    (user.userType as UserType) || "",
  );
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth);
  const [dateOfJoining, setDateOfJoining] = useState(user.dateOfJoining);
  const [dateOfLastPromotion, setDateOfLastPromotion] = useState(
    user.dateOfLastPromotion,
  );
  const [phone, setPhone] = useState(user.phone);
  const [personalEmail, setPersonalEmail] = useState(user.personalEmail);
  const [address, setAddress] = useState(user.address);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    user.roles.map((r) => r.id),
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, startSave] = useTransition();
  const [isBusy, startBusy] = useTransition();
  const [pendingDelete, setPendingDelete] = useState(false);

  // Pagination for user applications
  const pagination = usePagination(user.applications, 10);

  function toggleRole(roleId: string, checked: boolean) {
    setSelectedRoles((current) =>
      checked
        ? Array.from(new Set([...current, roleId]))
        : current.filter((id) => id !== roleId),
    );
  }

  function handleSave() {
    setFieldErrors({});
    startSave(async () => {
      const result = await updateUser(user.id, {
        name,
        employeeId,
        schoolId: schoolId === NO_SCHOOL ? "" : schoolId,
        designation,
        institution,
        userType,
        dateOfBirth,
        dateOfJoining,
        dateOfLastPromotion,
        phone,
        personalEmail,
        address,
        roleIds: selectedRoles,
      });

      if (result.ok) {
        toast.success("User updated.");
        broadcastUserUpdate();
        setMode("view");
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="app-shell section-stack" data-testid="user-detail">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserIcon className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {user.name}
              </h1>
              {user.disabled ? (
                <Badge variant="destructive">Disabled</Badge>
              ) : user.activated ? (
                <Badge variant="outline">Active</Badge>
              ) : (
                <Badge variant="secondary">Invited</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage ? (
            <>
              {mode === "view" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMode("edit")}
                  data-testid="edit-from-detail"
                >
                  <Pencil className="size-4" />
                  Edit details & roles
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMode("view")}
                >
                  Cancel edit
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  startBusy(async () => {
                    const result = await resendInvite(user.id);
                    if (result.ok) toast.success("Activation link sent.");
                    else toast.error(result.error ?? "Failed to send link.");
                  })
                }
              >
                <MailCheck className="size-4" />
                {user.activated ? "Reset password" : "Resend invite"}
              </Button>

              {user.id !== currentUserId ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={user.disabled}
                  data-testid={`impersonate-${user.email}`}
                  onClick={() =>
                    startBusy(async () => {
                      const result = await impersonateUser(user.id);
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success(`You are now viewing as ${user.name}.`);
                      router.push("/dashboard");
                      router.refresh();
                    })
                  }
                >
                  <Eye className="size-4" />
                  Impersonate
                </Button>
              ) : null}
            </>
          ) : null}

          {canManage ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/users">
                <ArrowLeft className="size-4" />
                Back to users
              </Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">
                <ArrowLeft className="size-4" />
                Back to dashboard
              </Link>
            </Button>
          )}
        </div>
      </div>

      {mode === "edit" && canManage ? (
        /* Edit Mode */
        <div className="rounded-xl border bg-card p-6 shadow-xs">
          <div className="mb-6 border-b pb-4">
            <h2 className="text-base font-semibold">Edit user particulars</h2>
            <p className="text-sm text-muted-foreground">
              Update employment particulars, designation, and roles for this
              account.
            </p>
          </div>

          <div className="form-stack">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(fieldErrors.name)}>
                <FieldLabel htmlFor="edit-user-name">Display name</FieldLabel>
                <Input
                  id="edit-user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <FieldError errors={[{ message: fieldErrors.name }]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-user-employeeId">
                  Employee ID
                </FieldLabel>
                <Input
                  id="edit-user-employeeId"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-user-school">School</FieldLabel>
                <Select value={schoolId} onValueChange={setSchoolId}>
                  <SelectTrigger
                    id="edit-user-school"
                    data-testid="user-school"
                  >
                    <SelectValue placeholder="Select school" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SCHOOL}>No school</SelectItem>
                    {allSchools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-user-designation">
                  Designation
                </FieldLabel>
                <Input
                  id="edit-user-designation"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Associate Professor"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-user-institution">
                  Institution
                </FieldLabel>
                <Input
                  id="edit-user-institution"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Manipal Institute of Technology"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-user-type">
                  Employment type
                </FieldLabel>
                <Select
                  value={userType || NO_USER_TYPE}
                  onValueChange={(v) =>
                    setUserType(v === NO_USER_TYPE ? "" : (v as UserType))
                  }
                >
                  <SelectTrigger id="edit-user-type" data-testid="user-type">
                    <SelectValue placeholder="Not recorded" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_USER_TYPE}>Not recorded</SelectItem>
                    {USER_TYPES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="edit-user-dob">Date of birth</FieldLabel>
                <Input
                  id="edit-user-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  data-testid="user-date-of-birth"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-user-doj">Date of joining</FieldLabel>
                <Input
                  id="edit-user-doj"
                  type="date"
                  value={dateOfJoining}
                  onChange={(e) => setDateOfJoining(e.target.value)}
                  data-testid="user-date-of-joining"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-user-dolp">
                  Date of last promotion
                </FieldLabel>
                <Input
                  id="edit-user-dolp"
                  type="date"
                  value={dateOfLastPromotion}
                  onChange={(e) => setDateOfLastPromotion(e.target.value)}
                  data-testid="user-date-of-last-promotion"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-user-phone">Phone number</FieldLabel>
                <Input
                  id="edit-user-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91..."
                />
              </Field>

              <Field data-invalid={Boolean(fieldErrors.personalEmail)}>
                <FieldLabel htmlFor="edit-user-personalEmail">
                  Personal email
                </FieldLabel>
                <Input
                  id="edit-user-personalEmail"
                  type="email"
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                />
                <FieldError errors={[{ message: fieldErrors.personalEmail }]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="edit-user-address">Address</FieldLabel>
              <Textarea
                id="edit-user-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
              />
            </Field>

            <Field>
              <FieldLabel>Assigned Roles</FieldLabel>
              <FieldDescription>
                Select which roles this user holds across the portal.
              </FieldDescription>
              <div className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-3">
                {allRoles.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selectedRoles.includes(r.id)}
                      onCheckedChange={(c) => toggleRole(r.id, c === true)}
                    />
                    <span className="text-sm font-medium">{r.name}</span>
                  </label>
                ))}
              </div>
            </Field>
          </div>

          <div className="mt-8 flex items-center justify-between border-t pt-4">
            {user.id !== currentUserId ? (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setPendingDelete(true)}
              >
                <Trash2 className="size-4" />
                Remove from whitelist
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setMode("view")}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* View Mode */
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left 2 Columns: Account Particulars & Roles */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            {/* Particulars Card */}
            <div className="rounded-xl border bg-card p-6 shadow-2xs">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                Account & Service Record
              </h2>
              <dl className="grid gap-4 sm:grid-cols-2">
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
                <Fact
                  label="Joined institute"
                  value={formatDate(user.dateOfJoining)}
                />
                <Fact
                  label="Last promoted"
                  value={formatDate(user.dateOfLastPromotion)}
                />
                <Fact label="Contact number" value={user.phone} />
                <Fact label="Personal email" value={user.personalEmail} />
                <Fact label="Address" value={user.address} />
                <Fact
                  label="On whitelist since"
                  value={formatDate(user.createdAt)}
                />
              </dl>
            </div>

            {/* Applications List */}
            <div
              className="rounded-xl border bg-card p-6 shadow-2xs"
              data-testid="user-applications"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="size-4 text-primary" />
                  Their applications ({user.applications.length})
                </h2>
              </div>

              {user.applications.length === 0 ? (
                <div className="empty-state border-0 py-8">
                  <FileText className="mb-1 size-6 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No applications started or submitted yet.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {pagination.items.map((app) => (
                    <div
                      key={app.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">
                            {app.reference}
                          </span>
                          <StatusBadge status={app.status} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {app.status === "draft"
                            ? `Started ${formatDate(app.createdAt)}, not yet submitted`
                            : `Submitted ${formatDate(app.submittedAt)}`}
                          {app.completedAt
                            ? ` · Decided ${formatDate(app.completedAt)}`
                            : app.stageLabel
                              ? ` · Now at ${app.stageLabel}`
                              : ""}
                        </span>
                      </div>

                      <Button asChild size="sm" variant="outline">
                        <Link href={`/applications/${app.id}`}>View file</Link>
                      </Button>
                    </div>
                  ))}

                  <ListPagination
                    pagination={pagination}
                    label="applications"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Roles & Authority Posts */}
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border bg-card p-6 shadow-2xs">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Shield className="size-4 text-primary" />
                Roles & Permissions
              </h2>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {user.roles.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    No roles assigned. Basic account access only.
                  </span>
                ) : (
                  user.roles.map((role) => (
                    <Badge key={role.id} variant="secondary">
                      {role.name}
                    </Badge>
                  ))
                )}
              </div>

              {user.signsFor.length > 0 ? (
                <div className="mt-3 border-t pt-3">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Signing Authority
                  </span>
                  <p className="text-sm font-medium">
                    {user.signsFor.join(", ")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their access is revoked immediately. Accounts with applications on
              record cannot be removed — disable them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy}
              onClick={(event) => {
                event.preventDefault();
                startBusy(async () => {
                  const result = await deleteUser(user.id);
                  if (result.ok) {
                    toast.success("User removed.");
                    broadcastUserUpdate();
                    router.push("/admin/users");
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
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt className="fact-label">{label}</dt>
      <dd className="fact-value">{value || "—"}</dd>
    </div>
  );
}
