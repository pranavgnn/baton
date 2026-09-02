import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";

import { BUCKET, s3 } from "@/lib/storage/s3";
import type { FileValue } from "@/lib/workflow/types";
import { ApplicationPdf } from "./document";
import type { PdfModel } from "./model";

/**
 * Turns the printable model into a single file: the form itself, then every
 * uploaded PDF appended in the order the Enclosures page lists them.
 *
 * Images are drawn inline where they were answered; anything that is neither
 * an image nor a PDF is named and left at that, because there is nothing
 * sensible to draw for a spreadsheet.
 */

/** One attachment is skipped past this; the enclosure list still names it. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** And the appended pages together stop here, so an export cannot run away. */
const MAX_APPENDED_BYTES = 60 * 1024 * 1024;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg"];

export async function renderApplicationPdf(
  model: PdfModel,
  filesByKey: Map<string, { objectKey: string }>,
): Promise<Uint8Array> {
  const fetched = await fetchAttachments(model.attachments, filesByKey);

  const images: Record<string, string> = {};
  for (const [id, entry] of fetched) {
    if (!IMAGE_TYPES.includes(entry.contentType.toLowerCase())) continue;
    images[id] =
      `data:${entry.contentType};base64,${Buffer.from(entry.bytes).toString("base64")}`;
  }

  const rendered = await renderToBuffer(
    <ApplicationPdf model={model} images={images} />,
  );

  const merged = await PDFDocument.load(rendered);
  let appended = 0;

  for (const file of model.attachments) {
    const entry = fetched.get(file.id);
    if (!entry || entry.contentType.toLowerCase() !== "application/pdf") {
      continue;
    }
    if (appended + entry.bytes.length > MAX_APPENDED_BYTES) break;
    appended += entry.bytes.length;

    try {
      const donor = await PDFDocument.load(entry.bytes, {
        // An encrypted enclosure still belongs in the file; refusing the whole
        // export because one upload is locked would be worse than copying it.
        ignoreEncryption: true,
      });
      const pages = await merged.copyPages(donor, donor.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch {
      // A corrupt or unreadable upload is left out rather than failing the
      // export: the enclosure list still records that it exists.
      continue;
    }
  }

  return merged.save();
}

type FetchedFile = { bytes: Uint8Array; contentType: string };

async function fetchAttachments(
  attachments: FileValue[],
  filesByKey: Map<string, { objectKey: string }>,
): Promise<Map<string, FetchedFile>> {
  const wanted = attachments.filter(
    (file) =>
      file.size <= MAX_ATTACHMENT_BYTES &&
      (IMAGE_TYPES.includes(file.contentType.toLowerCase()) ||
        file.contentType.toLowerCase() === "application/pdf") &&
      filesByKey.has(file.id),
  );

  const entries = await Promise.all(
    wanted.map(async (file) => {
      const record = filesByKey.get(file.id)!;
      try {
        const response = await s3().send(
          new GetObjectCommand({ Bucket: BUCKET, Key: record.objectKey }),
        );
        const bytes = await response.Body?.transformToByteArray();
        if (!bytes) return null;
        return [file.id, { bytes, contentType: file.contentType }] as const;
      } catch {
        // The bucket being unreachable must not cost the whole export.
        return null;
      }
    }),
  );

  return new Map(
    entries.filter((entry): entry is NonNullable<typeof entry> =>
      Boolean(entry),
    ),
  );
}
