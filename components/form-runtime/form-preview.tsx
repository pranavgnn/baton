import { Paperclip } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildPreview } from "@/lib/workflow/display";
import type { FormSchema, SectionData } from "@/lib/workflow/types";
import { formatBytes } from "@/lib/format";

export type FormPreviewProps = {
  form: FormSchema;
  data: SectionData | undefined | null;
  /** Rendered inside each section header, e.g. an "Edit" jump link. */
  renderSectionAction?: (sectionIndex: number) => React.ReactNode;
};

/** Read-only rendering of a completed form, used by the wizard and reviewers. */
export function FormPreview({
  form,
  data,
  renderSectionAction,
}: FormPreviewProps) {
  const sections = buildPreview(form, data);

  return (
    <div className="section-stack">
      {sections.map((section, index) => (
        <Card key={section.id} data-testid={`preview-section-${index}`}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
            {section.description ? (
              <CardDescription>{section.description}</CardDescription>
            ) : null}
            {renderSectionAction ? (
              <CardAction>{renderSectionAction(index)}</CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {section.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This section has no questions.
              </p>
            ) : (
              <dl>
                {section.rows.map(({ field, value }) => (
                  <div key={field.id} className="preview-row">
                    <dt className="preview-label">{field.label}</dt>
                    <dd className="preview-value">
                      {value.kind === "files" ? (
                        value.files.length === 0 ? (
                          "-"
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {value.files.map((file) => (
                              <li key={file.id}>
                                <a
                                  href={`/api/files/${file.id}?inline=1`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
                                >
                                  <Paperclip className="size-3.5" />
                                  {file.name}
                                  <span className="text-xs text-muted-foreground">
                                    ({formatBytes(file.size)})
                                  </span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : (
                        value.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
