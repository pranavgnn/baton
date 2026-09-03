"use client";

import {
  AlertTriangle,
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  Upload,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildImportRows,
  CSV_TEMPLATE,
  guessMapping,
  parseCsvTable,
  parseEmailList,
  type ColumnMapping,
  type ParsedImport,
} from "@/lib/users/import";
import {
  USER_TYPES,
  USER_FIELD_LIST,
  type UserFieldKey,
  type UserType,
} from "@/lib/users/profile";
import { bulkImportUsers, inviteUser } from "../actions";

export type RoleOption = { id: string; name: string };
export type SchoolOption = { id: string; name: string };

const NO_SCHOOL = "__none__";
const NO_USER_TYPE = "__unset__";
const NOT_IMPORTED = "__none__";
const EMPTY_IMPORT: ParsedImport = { rows: [], issues: [] };

function broadcastUserUpdate() {
  try {
    const channel = new BroadcastChannel("portal_users");
    channel.postMessage({ type: "users_updated" });
    channel.close();
  } catch {
    // ignore
  }
  try {
    localStorage.setItem("portal_users_updated", String(Date.now()));
  } catch {
    // ignore
  }
}

export function WhitelistClient({
  roles,
  schools,
}: {
  roles: RoleOption[];
  schools: SchoolOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "import" ? "import" : "single";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  /* -------------------------------------------------------------------------- */
  /* Single User Whitelist State                                                */
  /* -------------------------------------------------------------------------- */
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [schoolId, setSchoolId] = useState(NO_SCHOOL);
  const [designation, setDesignation] = useState("");
  const [institution, setInstitution] = useState("");
  const [userType, setUserType] = useState<UserType | "">("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [dateOfLastPromotion, setDateOfLastPromotion] = useState("");
  const [phone, setPhone] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [address, setAddress] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    roles[0] ? [roles[0].id] : [],
  );
  const [sendInvite, setSendInvite] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, startSubmit] = useTransition();

  function toggleRole(roleId: string, checked: boolean) {
    setSelectedRoles((current) =>
      checked
        ? Array.from(new Set([...current, roleId]))
        : current.filter((id) => id !== roleId),
    );
  }

  function handleInviteSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});

    startSubmit(async () => {
      const result = await inviteUser({
        email,
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
        sendInvite,
      });

      if (result.ok) {
        toast.success(
          sendInvite
            ? `${email} whitelisted and invitation link sent.`
            : `${email} whitelisted.`,
        );
        broadcastUserUpdate();
        router.push("/admin/users");
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Bulk CSV Import State                                                      */
  /* -------------------------------------------------------------------------- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [listText, setListText] = useState("");
  const [importMode, setImportMode] = useState<"csv" | "list">("csv");
  const [hasHeader, setHasHeader] = useState(true);
  const [bulkSendInvites, setBulkSendInvites] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [isBulkImporting, startBulkImport] = useTransition();

  const table = useMemo(
    () => (csvText ? parseCsvTable(csvText, hasHeader) : null),
    [csvText, hasHeader],
  );

  const parsed: ParsedImport =
    importMode === "csv"
      ? table
        ? buildImportRows(table, mapping)
        : EMPTY_IMPORT
      : listText
        ? parseEmailList(listText)
        : EMPTY_IMPORT;

  function readCsv(text: string, header = hasHeader) {
    setCsvText(text);
    const parsedTable = parseCsvTable(text, header);
    setMapping(header ? guessMapping(parsedTable.header) : {});
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      readCsv(text);
    };
    reader.readAsText(file);
  }

  function handleBulkSubmit() {
    startBulkImport(async () => {
      const result = await bulkImportUsers({
        rows: parsed.rows.map((row) => ({ ...row, line: undefined })),
        sendInvites: bulkSendInvites,
      });

      if (result.ok) {
        const { created, skipped } = result.data;
        if (skipped.length === 0) {
          toast.success(`Imported ${created} user${created === 1 ? "" : "s"}.`);
        } else {
          toast.warning(`Imported ${created}, skipped ${skipped.length}.`, {
            description: skipped
              .slice(0, 5)
              .map((entry) => `${entry.email}: ${entry.reason}`)
              .join("\n"),
          });
        }
        broadcastUserUpdate();
        router.push("/admin/users");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="app-shell section-stack">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              Whitelist & User Provisioning
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Add institute staff to the whitelist individually or import in bulk
            via CSV.
          </p>
        </div>

        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/users">
            <ArrowLeft className="size-4" />
            Back to users
          </Link>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="single" className="gap-2">
            <UserPlus className="size-4" />
            Single User Whitelist
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-2">
            <FileSpreadsheet className="size-4" />
            Bulk CSV Import
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Single User */}
        <TabsContent value="single">
          <form
            onSubmit={handleInviteSubmit}
            className="max-w-4xl rounded-xl border bg-card p-6 shadow-xs"
            data-testid="invite-user-form"
          >
            <div className="mb-6 border-b pb-4">
              <h2 className="text-base font-semibold">User Details</h2>
              <p className="text-sm text-muted-foreground">
                Enter user identity and initial employment profile for whitelist
                authorization.
              </p>
            </div>

            <div className="form-stack">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(fieldErrors.email)}>
                  <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    placeholder="name@manipal.edu"
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.email)}
                    required
                  />
                  <FieldError errors={[{ message: fieldErrors.email }]} />
                  <FieldDescription>
                    Must be an institute email address.
                  </FieldDescription>
                </Field>

                <Field data-invalid={Boolean(fieldErrors.name)}>
                  <FieldLabel htmlFor="invite-name">Display name</FieldLabel>
                  <Input
                    id="invite-name"
                    value={name}
                    placeholder="Prof. John Doe"
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.name)}
                    required
                  />
                  <FieldError errors={[{ message: fieldErrors.name }]} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="invite-school">School</FieldLabel>
                  <Select value={schoolId} onValueChange={setSchoolId}>
                    <SelectTrigger id="invite-school" data-testid="user-school">
                      <SelectValue placeholder="Select school" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SCHOOL}>No school</SelectItem>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="invite-employeeId">
                    Employee ID
                  </FieldLabel>
                  <Input
                    id="invite-employeeId"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="e.g. EMP-10492"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="invite-designation">
                    Designation
                  </FieldLabel>
                  <Input
                    id="invite-designation"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Professor"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="invite-institution">
                    Institution
                  </FieldLabel>
                  <Input
                    id="invite-institution"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g. Manipal Institute of Technology"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="invite-type">Employment type</FieldLabel>
                  <Select
                    value={userType || NO_USER_TYPE}
                    onValueChange={(v) =>
                      setUserType(v === NO_USER_TYPE ? "" : (v as UserType))
                    }
                  >
                    <SelectTrigger id="invite-type" data-testid="user-type">
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
                  <FieldLabel htmlFor="invite-dob">Date of birth</FieldLabel>
                  <Input
                    id="invite-dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    data-testid="user-date-of-birth"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="invite-doj">Date of joining</FieldLabel>
                  <Input
                    id="invite-doj"
                    type="date"
                    value={dateOfJoining}
                    onChange={(e) => setDateOfJoining(e.target.value)}
                    data-testid="user-date-of-joining"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="invite-dolp">
                    Date of last promotion
                  </FieldLabel>
                  <Input
                    id="invite-dolp"
                    type="date"
                    value={dateOfLastPromotion}
                    onChange={(e) => setDateOfLastPromotion(e.target.value)}
                    data-testid="user-date-of-last-promotion"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="invite-phone">Phone number</FieldLabel>
                  <Input
                    id="invite-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91..."
                  />
                </Field>

                <Field data-invalid={Boolean(fieldErrors.personalEmail)}>
                  <FieldLabel htmlFor="invite-personalEmail">
                    Personal email
                  </FieldLabel>
                  <Input
                    id="invite-personalEmail"
                    type="email"
                    value={personalEmail}
                    onChange={(e) => setPersonalEmail(e.target.value)}
                  />
                  <FieldError
                    errors={[{ message: fieldErrors.personalEmail }]}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="invite-address">Address</FieldLabel>
                <Textarea
                  id="invite-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                />
              </Field>

              <Field>
                <FieldLabel>Roles</FieldLabel>
                <FieldDescription>
                  Assign roles to grant specific portal access and review
                  capabilities.
                </FieldDescription>
                <div className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-3">
                  {roles.map((r) => (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selectedRoles.includes(r.id)}
                        onCheckedChange={(c) => toggleRole(r.id, c === true)}
                        aria-label={r.name}
                      />
                      <span className="text-sm font-medium">{r.name}</span>
                    </label>
                  ))}
                </div>
              </Field>

              <label className="flex cursor-pointer items-center gap-2.5 pt-2">
                <Checkbox
                  checked={sendInvite}
                  onCheckedChange={(c) => setSendInvite(c === true)}
                />
                <span className="text-sm">
                  Send email invitation with activation link immediately
                </span>
              </label>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin/users")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Add user
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Tab 2: Bulk Import */}
        <TabsContent value="import">
          <div className="section-stack max-w-4xl rounded-xl border bg-card p-6 shadow-xs">
            <div className="border-b pb-4">
              <h2 className="text-base font-semibold">Bulk Import Users</h2>
              <p className="text-sm text-muted-foreground">
                Paste an address list or upload a CSV file to add multiple staff
                members at once.
              </p>
            </div>

            <Tabs
              value={importMode}
              onValueChange={(v) => setImportMode(v as "csv" | "list")}
            >
              <TabsList className="mb-4">
                <TabsTrigger value="csv">CSV spreadsheet</TabsTrigger>
                <TabsTrigger value="list">Paste addresses</TabsTrigger>
              </TabsList>

              <TabsContent value="csv" className="section-stack">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload className="size-4" />
                      Upload CSV file
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={hasHeader}
                        onCheckedChange={(c) => {
                          const checked = c === true;
                          setHasHeader(checked);
                          if (csvText) readCsv(csvText, checked);
                        }}
                      />
                      First row is header
                    </label>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => readCsv(CSV_TEMPLATE)}
                  >
                    Load template
                  </Button>
                </div>

                <Textarea
                  value={csvText}
                  onChange={(e) => readCsv(e.target.value)}
                  placeholder="name,email,employeeId,school,designation..."
                  rows={5}
                  className="font-mono text-xs"
                  data-testid="import-csv"
                />

                {table && table.header.length > 0 ? (
                  <div className="section-stack" data-testid="import-mapping">
                    <h3 className="text-sm font-semibold">Column Mappings</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {USER_FIELD_LIST.map((field) => {
                        const index = mapping[field.key as UserFieldKey];
                        return (
                          <div key={field.key} className="flex flex-col gap-1">
                            <span className="truncate text-xs font-medium text-muted-foreground">
                              {field.label} {field.required ? "*" : ""}
                            </span>
                            <Select
                              value={
                                index === undefined
                                  ? NOT_IMPORTED
                                  : String(index)
                              }
                              onValueChange={(val) =>
                                setMapping((current) => {
                                  const next = { ...current };
                                  if (val === NOT_IMPORTED) {
                                    delete next[field.key as UserFieldKey];
                                  } else {
                                    next[field.key as UserFieldKey] =
                                      Number(val);
                                  }
                                  return next;
                                })
                              }
                            >
                              <SelectTrigger
                                className="h-8 text-xs"
                                data-testid={`map-${field.key}`}
                              >
                                <SelectValue placeholder="Map to column" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NOT_IMPORTED}>
                                  Not imported
                                </SelectItem>
                                {table.header.map((col, idx) => (
                                  <SelectItem key={idx} value={String(idx)}>
                                    {col || `Column ${idx + 1}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="list" className="section-stack">
                <FieldLabel htmlFor="import-list-text">
                  Paste addresses and names
                </FieldLabel>
                <Textarea
                  id="import-list-text"
                  value={listText}
                  onChange={(e) => setListText(e.target.value)}
                  placeholder="john@manipal.edu, John Doe&#10;jane@manipal.edu"
                  rows={6}
                  data-testid="import-list"
                />
              </TabsContent>
            </Tabs>

            {/* Validation Issues */}
            {parsed.issues.length > 0 ? (
              <Alert variant="destructive" data-testid="import-issues">
                <AlertTriangle className="size-4" />
                <AlertTitle>
                  {parsed.issues.length} parsing issues found
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4 text-xs">
                    {parsed.issues.slice(0, 5).map((issue, idx) => (
                      <li key={idx}>
                        Line {issue.line}: {issue.message}
                      </li>
                    ))}
                    {parsed.issues.length > 5 ? (
                      <li>...and {parsed.issues.length - 5} more</li>
                    ) : null}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Preview Table */}
            {parsed.rows.length > 0 ? (
              <div className="section-stack" data-testid="import-preview">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Preview: Ready to import ({parsed.rows.length} users)
                  </h3>
                </div>

                <div className="max-h-64 overflow-hidden overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>School</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.rows.slice(0, 10).map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">
                            {r.email}
                          </TableCell>
                          <TableCell className="text-sm">{r.name}</TableCell>
                          <TableCell className="text-xs">
                            {r.employeeId || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.school || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}

            <label className="flex cursor-pointer items-center gap-2.5 pt-2">
              <Checkbox
                checked={bulkSendInvites}
                onCheckedChange={(c) => setBulkSendInvites(c === true)}
              />
              <span className="text-sm">
                Send activation invitation emails to all imported users
              </span>
            </label>

            <div className="mt-8 flex items-center justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin/users")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleBulkSubmit}
                disabled={isBulkImporting || parsed.rows.length === 0}
                data-testid="confirm-import"
              >
                {isBulkImporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Import {parsed.rows.length} users
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
