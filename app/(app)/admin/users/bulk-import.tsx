"use client";

import { AlertTriangle, Loader2, Upload, Users } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  userTypeLabel,
  USER_FIELD_LIST,
  type UserFieldKey,
} from "@/lib/users/profile";
import { bulkImportUsers } from "./actions";

const EMPTY: ParsedImport = { rows: [], issues: [] };

/** Radix forbids an empty item value, so "ignore this field" carries one. */
const NOT_IMPORTED = "__none__";

export function BulkImportDialog({
  open,
  onOpenChange,
  defaultRoleName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRoleName: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [listText, setListText] = useState("");
  const [mode, setMode] = useState<"csv" | "list">("csv");
  const [hasHeader, setHasHeader] = useState(true);
  const [sendInvites, setSendInvites] = useState(true);
  const [isImporting, startImport] = useTransition();

  /**
   * Which column feeds which field.
   *
   * Guessed from the header when a file arrives and then owned by the admin:
   * an institute's own export names its columns whatever it names them, and
   * correcting the guess must not mean editing the file.
   */
  const [mapping, setMapping] = useState<ColumnMapping>({});

  const table = useMemo(
    () => (csvText ? parseCsvTable(csvText, hasHeader) : null),
    [csvText, hasHeader],
  );

  const parsed: ParsedImport =
    mode === "csv"
      ? table
        ? buildImportRows(table, mapping)
        : EMPTY
      : listText
        ? parseEmailList(listText)
        : EMPTY;

  function readCsv(text: string, header = hasHeader) {
    setCsvText(text);
    const next = parseCsvTable(text, header);
    setMapping(header ? guessMapping(next.header) : {});
  }

  function reset() {
    setCsvText("");
    setListText("");
    setMapping({});
    setHasHeader(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    readCsv(await file.text());
  }

  function handleImport() {
    startImport(async () => {
      const result = await bulkImportUsers({
        // The line number is for reporting here, not for the server.
        rows: parsed.rows.map((row) => ({ ...row, line: undefined })),
        sendInvites,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

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

      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl"
        data-testid="bulk-import-dialog"
      >
        <DialogHeader>
          <DialogTitle>Import users</DialogTitle>
          <DialogDescription>
            Nothing is written until you have seen the preview.
            {defaultRoleName
              ? ` Rows naming no role are given "${defaultRoleName}".`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as "csv" | "list")}
        >
          <TabsList>
            <TabsTrigger value="csv">CSV file</TabsTrigger>
            <TabsTrigger value="list">Paste addresses</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="form-stack pt-4">
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="import-file">Choose a .csv file</FieldLabel>
              <input
                ref={fileRef}
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                className="text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
                onChange={(event) => void handleFile(event.target.files?.[0])}
                data-testid="import-file"
              />
              <FieldDescription>
                Any columns, in any order: you say which is which below. Only
                the email address is needed.
              </FieldDescription>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => readCsv(CSV_TEMPLATE, true)}
                data-testid="load-csv-example"
              >
                Load an example
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="import-csv">or paste the CSV</FieldLabel>
              <Textarea
                id="import-csv"
                rows={6}
                value={csvText}
                className="font-mono text-xs"
                placeholder={CSV_TEMPLATE}
                onChange={(event) => readCsv(event.target.value)}
                data-testid="import-csv"
              />
            </div>

            {table ? (
              <div className="form-stack" data-testid="import-mapping">
                <label className="flex items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={hasHeader}
                    data-testid="import-has-header"
                    onCheckedChange={(checked) => {
                      const next = checked === true;
                      setHasHeader(next);
                      readCsv(csvText, next);
                    }}
                  />
                  The first line names the columns
                </label>

                <div>
                  <FieldLabel>Which column is which</FieldLabel>
                  <FieldDescription>
                    Anything left as &ldquo;Not imported&rdquo; is ignored,
                    whether or not the file has a column for it.
                  </FieldDescription>
                </div>

                <ScrollArea className="h-56 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-56">Portal field</TableHead>
                        <TableHead>Column in your file</TableHead>
                        <TableHead className="w-40">First row</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {USER_FIELD_LIST.map((field) => {
                        const index = mapping[field.key as UserFieldKey];
                        const sample =
                          index === undefined
                            ? ""
                            : (table.rows[0]?.cells[index] ?? "");

                        return (
                          <TableRow key={field.key}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {field.label}
                                  {field.required ? " *" : ""}
                                </span>
                                {field.hint ? (
                                  <span className="text-xs text-muted-foreground">
                                    {field.hint}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={
                                  index === undefined
                                    ? NOT_IMPORTED
                                    : String(index)
                                }
                                onValueChange={(value) =>
                                  setMapping((current) => {
                                    const next = { ...current };
                                    if (value === NOT_IMPORTED) {
                                      delete next[field.key as UserFieldKey];
                                    } else {
                                      next[field.key as UserFieldKey] =
                                        Number(value);
                                    }
                                    return next;
                                  })
                                }
                              >
                                <SelectTrigger
                                  data-testid={`map-${field.key}`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NOT_IMPORTED}>
                                    Not imported
                                  </SelectItem>
                                  {table.header.map((column, position) => (
                                    <SelectItem
                                      key={position}
                                      value={String(position)}
                                    >
                                      {column || `Column ${position + 1}`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="truncate font-mono text-xs text-muted-foreground">
                              {sample || "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="list" className="form-stack pt-4">
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="import-list">
                One address per line
              </FieldLabel>
              <Textarea
                id="import-list"
                rows={8}
                value={listText}
                className="font-mono text-xs"
                placeholder={
                  "a.person@manipal.edu\nAnother Person <another.person@manipal.edu>"
                }
                onChange={(event) => setListText(event.target.value)}
                data-testid="import-list"
              />
              <FieldDescription>
                Everyone gets the default role. Names are taken from the address
                unless written as <code>Name &lt;address&gt;</code>.
              </FieldDescription>
            </div>
          </TabsContent>
        </Tabs>

        {parsed.issues.length > 0 ? (
          <Alert variant="destructive" data-testid="import-issues">
            <AlertTriangle className="size-4" />
            <AlertTitle>
              {parsed.issues.length} row
              {parsed.issues.length === 1 ? "" : "s"} will be skipped
            </AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-0.5 pl-4">
                {parsed.issues.slice(0, 6).map((issue, index) => (
                  <li key={index}>
                    Line {issue.line}: {issue.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {parsed.rows.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Users className="size-4" />
              <span className="text-sm font-medium">
                {parsed.rows.length} user
                {parsed.rows.length === 1 ? "" : "s"} ready to import
              </span>
            </div>

            <ScrollArea className="h-64 rounded-md border">
              <Table data-testid="import-preview">
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Roles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.map((row) => (
                    <TableRow key={row.email}>
                      <TableCell className="font-mono text-xs">
                        {row.email}
                      </TableCell>
                      <TableCell className="text-sm">{row.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.school || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {userTypeLabel(row.userType)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.dateOfJoining || "-"}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {row.roles.length === 0 ? (
                            <Badge variant="outline">
                              {defaultRoleName ?? "Default"}
                            </Badge>
                          ) : (
                            row.roles.map((name) => (
                              <Badge key={name} variant="secondary">
                                {name}
                              </Badge>
                            ))
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        ) : null}

        <label className="flex items-center gap-2.5 rounded-md border p-2.5 text-sm">
          <Checkbox
            checked={sendInvites}
            onCheckedChange={(checked) => setSendInvites(checked === true)}
          />
          Email everyone their activation link
        </label>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || parsed.rows.length === 0}
            data-testid="confirm-import"
          >
            {isImporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Import {parsed.rows.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
