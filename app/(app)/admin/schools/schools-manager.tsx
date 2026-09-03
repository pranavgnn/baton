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
import type { SchoolPerson, SchoolRecord } from "@/lib/schools/query";
import { createSchool, deleteSchool, findUsers, updateSchool } from "./actions";

export function SchoolsManager({ schools }: { schools: SchoolRecord[] }) {
  const [editing, setEditing] = useState<SchoolRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SchoolRecord | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return schools;
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.code && s.code.toLowerCase().includes(needle)) ||
        (s.dean && s.dean.name.toLowerCase().includes(needle)),
    );
  }, [schools, query]);

  const pagination = usePagination(filtered, 12);

  function handleDelete() {
    if (!pendingDelete) return;
    startDelete(async () => {
      const result = await deleteSchool(pendingDelete.id);
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
            placeholder="Search by school name, code or dean"
            className="pl-8"
            aria-label="Search schools"
          />
        </div>
        <Button onClick={() => setCreating(true)} data-testid="new-school">
          <Plus className="size-4" />
          Add a school
        </Button>
      </div>

      {schools.length === 0 ? (
        <p className="empty-state" data-testid="schools-empty">
          No schools yet. Add one, then give its people a school on the Users
          page.
        </p>
      ) : filtered.length === 0 ? (
        <p className="empty-state">No schools match that search.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pagination.items.map((entry) => (
            <Card key={entry.id} data-testid={`school-card-${entry.name}`}>
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
                  <span className="fact-label">Dean</span>
                  <span
                    className="fact-value"
                    data-testid={`dean-${entry.name}`}
                  >
                    {entry.dean ? entry.dean.name : "Not assigned"}
                  </span>
                </div>

                <div className="fact">
                  <span className="fact-label">Associate deans</span>
                  {entry.associateDeans.length === 0 ? (
                    <span className="fact-value text-muted-foreground">
                      None assigned
                    </span>
                  ) : (
                    <span
                      className="flex flex-wrap gap-1"
                      data-testid={`associate-deans-${entry.name}`}
                    >
                      {entry.associateDeans.map((person) => (
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

      <ListPagination pagination={pagination} label="schools" />

      <SchoolEditor
        key={editing?.id ?? "new"}
        open={creating || Boolean(editing)}
        school={editing}
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
              This cannot be undone. A school still holding accounts cannot be
              deleted.
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
              data-testid="confirm-delete-school"
            >
              Delete school
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

function SchoolEditor({
  open,
  school,
  onOpenChange,
}: {
  open: boolean;
  school: SchoolRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(school?.name ?? "");
  const [code, setCode] = useState(school?.code ?? "");
  const [dean, setDean] = useState<SchoolPerson | null>(school?.dean ?? null);
  const [associates, setAssociates] = useState<SchoolPerson[]>(
    school?.associateDeans ?? [],
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, startSave] = useTransition();

  function handleSave() {
    setFieldErrors({});
    startSave(async () => {
      const payload = {
        name,
        code,
        deanId: dean?.id ?? "",
        associateDeanIds: associates.map((person) => person.id),
      };
      const result = school
        ? await updateSchool(school.id, payload)
        : await createSchool(payload);

      if (result.ok) {
        toast.success(school ? "School updated." : "School created.");
        onOpenChange(false);
        return;
      }

      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="school-dialog">
        <DialogHeader>
          <DialogTitle>{school ? "Edit school" : "Add a school"}</DialogTitle>
          <DialogDescription>
            An application from someone in this school goes to its dean, who
            sends it on to one of its associate deans.
          </DialogDescription>
        </DialogHeader>

        <div className="form-stack">
          <Field data-invalid={Boolean(fieldErrors.name)}>
            <FieldLabel htmlFor="school-name">Name</FieldLabel>
            <Input
              id="school-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              placeholder="School of Computer Engineering"
            />
            {fieldErrors.name ? (
              <FieldDescription>{fieldErrors.name}</FieldDescription>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="school-code">Short form</FieldLabel>
            <Input
              id="school-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="SOCE"
            />
            <FieldDescription>
              Used where the full name will not fit. Optional.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Dean</FieldLabel>
            <PersonPicker
              label={dean ? dean.name : "Choose a dean"}
              testId="school-dean"
              onSelect={(person) => setDean(person)}
            />
            {dean ? (
              <span className="flex flex-wrap gap-1">
                <PersonChip person={dean} onRemove={() => setDean(null)} />
              </span>
            ) : null}
          </Field>

          <Field>
            <FieldLabel>Associate deans</FieldLabel>
            <PersonPicker
              label="Add an associate dean"
              testId="school-associate-dean"
              onSelect={(person) =>
                setAssociates((current) =>
                  current.some((entry) => entry.id === person.id)
                    ? current
                    : [...current, person],
                )
              }
            />
            <FieldDescription>
              The dean must send every application to one of these.
            </FieldDescription>
            {associates.length > 0 ? (
              <span
                className="flex flex-wrap gap-1"
                data-testid="chosen-associate-deans"
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
            data-testid="save-school"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            {school ? "Save changes" : "Create school"}
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
  person: SchoolPerson;
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
 * dropdown of a few thousand names helps nobody choose a dean.
 */
function PersonPicker({
  label,
  testId,
  onSelect,
}: {
  label: string;
  testId: string;
  onSelect: (person: SchoolPerson) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SchoolPerson[]>([]);
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
