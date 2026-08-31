"use client";

import { FileUp, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { FieldValidation, FileValue } from "@/lib/workflow/types";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadOne(
  file: File,
  onProgress: (percent: number) => void,
): Promise<FileValue> {
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });

  if (!presign.ok) {
    const body = (await presign.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not start the upload.");
  }

  const { id, uploadUrl } = (await presign.json()) as {
    id: string;
    uploadUrl: string;
  };

  // XHR rather than fetch: it is the only way to report upload progress.
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl, true);
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (${request.status}).`));
    request.onerror = () =>
      reject(new Error("The upload could not reach storage."));
    request.send(file);
  });

  const confirm = await fetch("/api/uploads/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!confirm.ok) {
    const body = (await confirm.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "The upload could not be confirmed.");
  }

  return (await confirm.json()) as FileValue;
}

export type FileFieldProps = {
  id: string;
  value: FileValue | FileValue[] | null;
  onChange: (value: FileValue | FileValue[] | null) => void;
  validation: FieldValidation;
  disabled?: boolean;
  invalid?: boolean;
};

export function FileField({
  id,
  value,
  onChange,
  validation,
  disabled,
  invalid,
}: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const maxFiles = validation.maxFiles ?? 1;
  const multiple = maxFiles > 1;
  const files: FileValue[] = multiple
    ? ((value as FileValue[] | null) ?? [])
    : value
      ? [value as FileValue]
      : [];

  const accept = validation.acceptedFileTypes?.join(",") || undefined;

  async function handleSelect(selected: FileList | null) {
    if (!selected || selected.length === 0) return;

    const room = maxFiles - files.length;
    if (room <= 0) {
      toast.error(
        `You can attach at most ${maxFiles} file${maxFiles === 1 ? "" : "s"}.`,
      );
      return;
    }

    const chosen = Array.from(selected).slice(0, room);
    const limitBytes = validation.maxFileSizeMb
      ? validation.maxFileSizeMb * 1024 * 1024
      : null;

    const uploaded: FileValue[] = [];
    for (const file of chosen) {
      if (limitBytes && file.size > limitBytes) {
        toast.error(
          `${file.name} is ${formatBytes(file.size)} - the limit is ${validation.maxFileSizeMb} MB.`,
        );
        continue;
      }
      try {
        setProgress(0);
        uploaded.push(await uploadOne(file, setProgress));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "The upload failed.",
        );
      } finally {
        setProgress(null);
      }
    }

    if (uploaded.length === 0) return;
    onChange(multiple ? [...files, ...uploaded] : uploaded[0]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(fileId: string) {
    const remaining = files.filter((file) => file.id !== fileId);
    onChange(multiple ? remaining : (remaining[0] ?? null));
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled || progress !== null}
        aria-invalid={invalid}
        onChange={(event) => void handleSelect(event.target.files)}
      />

      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={disabled || progress !== null || files.length >= maxFiles}
        onClick={() => inputRef.current?.click()}
        data-testid={`upload-${id}`}
      >
        {progress !== null ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileUp className="size-4" />
        )}
        {files.length >= maxFiles
          ? `Limit of ${maxFiles} reached`
          : multiple
            ? "Add files"
            : files.length > 0
              ? "Replace file"
              : "Choose file"}
      </Button>

      {progress !== null ? (
        <Progress value={progress} aria-label="Upload progress" />
      ) : null}

      {files.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm"
              data-testid={`file-${file.name}`}
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={`/api/files/${file.id}?inline=1`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
              >
                {file.name}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </span>
              {disabled ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => remove(file.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
