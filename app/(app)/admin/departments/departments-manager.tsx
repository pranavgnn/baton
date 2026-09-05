"use client";

import {
  Building2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import type {
  DepartmentPerson,
  DepartmentRecord,
} from "@/lib/departments/query";
import {
  createDepartment,
  deleteDepartment,
  findUsers,
  updateDepartment,
} from "./actions";

export function DepartmentsManager({
  departments,
}: {
  departments: DepartmentRecord[];
}) {
  const [editing, setEditing] = useState<DepartmentRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DepartmentRecord | null>(
    null,
  );
  const [isDeleting, startDelete] = useTransition();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return departments;
    return departments.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.code && s.code.toLowerCase().includes(needle)) ||
        (s.head && s.head.name.toLowerCase().includes(needle)),
    );
  }, [departments, query]);

  const pagination = usePagination(filtered, 12);

  function handleDelete() {
    if (!pendingDelete) return;
    startDelete(async () => {
      const result = await deleteDepartment(pendingDelete.id);
      setPendingDelete(null);
      if (result.ok) toast.success(`Deleted "${pendingDelete.name}".`);
      else toast.error(result.error);
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
            placeholder="Search by department name, code or head"
            className="pl-8"
            aria-label="Search departments"
          />
        </div>
        <Button onClick={() => setCreating(true)} data-testid="new-department">
          <Plus className="size-4" />
          Add a department
        </Button>
      </div>

      {departments.length === 0 ? (
        <p className="empty-state" data-testid="departments-empty">
          No departments yet. Add one, then give its people a department on the
          Users page.
        </p>
      ) : filtered.length === 0 ? (
        <p className="empty-state">No departments match that search.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pagination.items.map((entry) => (
            <Card key={entry.id} data-testid={`department-card-${entry.name}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-4" />
                  {entry.name}
                  {entry.code ? (
                    <Badge variant="outline">{entry.code}</Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  {entry.memberCount} member
                  {entry.memberCount === 1 ? "" : "s"}
                </CardDescription>
                <CardAction>
                  <span className="toolbar">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(entry)}
                      aria-label={`Edit ${entry.name}`}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setPendingDelete(entry)}
                      aria-label={`Delete ${entry.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </CardAction>
              </CardHeader>

              <CardContent className="flex flex-col gap-3">
                <div className="fact">
                  <span className="fact-label">Head</span>
                  <span
                    className="fact-value"
                    data-testid={`head-${entry.name}`}
                  >
                    {entry.head ? entry.head.name : "Not assigned"}
                  </span>
                </div>

                <div className="fact">
                  <span className="fact-label">Associate heads</span>
                  {entry.deputies.length === 0 ? (
                    <span className="fact-value text-muted-foreground">
                      None assigned
                    </span>
                  ) : (
                    <span
                      className="flex flex-wrap gap-1"
                      data-testid={`associate-heads-${entry.name}`}
                    >
                      {entry.deputies.map((person) => (
                        <Badge key={person.id} variant="secondary">
                          {person.name}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ListPagination pagination={pagination} label="departments" />

      <DepartmentEditor
        key={editing?.id ?? "new"}
        open={creating || Boolean(editing)}
        department={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
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
            <AlertDialogTitle>
              Delete &ldquo;{pendingDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. A department still holding accounts cannot
              be deleted.
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
              data-testid="confirm-delete-department"
            >
              Delete department
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Editor                                                                     */
/* -------------------------------------------------------------------------- */

function DepartmentEditor({
  open,
  department,
  onOpenChange,
}: {
  open: boolean;
  department: DepartmentRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");
  const [head, setHead] = useState<DepartmentPerson | null>(
    department?.head ?? null,
  );
  const [associates, setAssociates] = useState<DepartmentPerson[]>(
    department?.deputies ?? [],
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, startSave] = useTransition();

  function handleSave() {
    setFieldErrors({});
    startSave(async () => {
      const payload = {
        name,
        code,
        headId: head?.id ?? "",
        deputyIds: associates.map((person) => person.id),
      };
      const result = department
        ? await updateDepartment(department.id, payload)
        : await createDepartment(payload);

      if (result.ok) {
        toast.success(
          department ? "Department updated." : "Department created.",
        );
        onOpenChange(false);
        return;
      }

      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="department-dialog">
        <DialogHeader>
          <DialogTitle>
            {department ? "Edit department" : "Add a department"}
          </DialogTitle>
          <DialogDescription>
            An application from someone in this department goes to its head, who
            sends it on to one of its deputies.
          </DialogDescription>
        </DialogHeader>

        <div className="form-stack">
          <Field data-invalid={Boolean(fieldErrors.name)}>
            <FieldLabel htmlFor="department-name">Name</FieldLabel>
            <Input
              id="department-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              placeholder="e.g. Engineering"
            />
            {fieldErrors.name ? (
              <FieldDescription>{fieldErrors.name}</FieldDescription>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="department-code">Short form</FieldLabel>
            <Input
              id="department-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="SOCE"
            />
            <FieldDescription>
              Used where the full name will not fit. Optional.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Head</FieldLabel>
            <PersonPicker
              label={head ? head.name : "Choose a head"}
              testId="department-head"
              onSelect={(person) => setHead(person)}
            />
            {head ? (
              <span className="flex flex-wrap gap-1">
                <PersonChip person={head} onRemove={() => setHead(null)} />
              </span>
            ) : null}
          </Field>

          <Field>
            <FieldLabel>Associate heads</FieldLabel>
            <PersonPicker
              label="Add an deputy"
              testId="department-associate-head"
              onSelect={(person) =>
                setAssociates((current) =>
                  current.some((entry) => entry.id === person.id)
                    ? current
                    : [...current, person],
                )
              }
            />
            <FieldDescription>
              The head must send every application to one of these.
            </FieldDescription>
            {associates.length > 0 ? (
              <span
                className="flex flex-wrap gap-1"
                data-testid="chosen-associate-heads"
              >
                {associates.map((person) => (
                  <PersonChip
                    key={person.id}
                    person={person}
                    onRemove={() =>
                      setAssociates((current) =>
                        current.filter((entry) => entry.id !== person.id),
                      )
                    }
                  />
                ))}
              </span>
            ) : null}
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
          <Button
            onClick={handleSave}
            disabled={isSaving}
            data-testid="save-department"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            {department ? "Save changes" : "Create department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonChip({
  person,
  onRemove,
}: {
  person: DepartmentPerson;
  onRemove: () => void;
}) {
  return (
    <span className="audit-chip" data-testid={`person-${person.email}`}>
      {person.name}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${person.name}`}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/**
 * One account, found by typing.
 *
 * Never a list of everybody: the portal is meant for an institute, and a
 * dropdown of a few thousand names helps nobody choose a head.
 */
function PersonPicker({
  label,
  testId,
  onSelect,
}: {
  label: string;
  testId: string;
  onSelect: (person: DepartmentPerson) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DepartmentPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function lookup(next: string, delay = 250) {
    setQuery(next);
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      const result = await findUsers(next);
      setResults(result.ok ? result.data.users : []);
      setLoading(false);
    }, delay);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) lookup(query, 0);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          data-testid={testId}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type a name or email"
            value={query}
            onValueChange={lookup}
            data-testid={`${testId}-search`}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Searching
              </div>
            ) : (
              <CommandEmpty>Nobody matches that.</CommandEmpty>
            )}
            <CommandGroup>
              {results.map((person) => (
                <CommandItem
                  key={person.id}
                  value={person.id}
                  onSelect={() => {
                    onSelect(person);
                    setOpen(false);
                  }}
                  data-testid={`${testId}-${person.email}`}
                >
                  <span className="flex flex-col">
                    <span>{person.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {person.email}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
