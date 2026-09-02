import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Downloads the application as it stands: the submission plus every review
 * signed off so far.
 *
 * A plain anchor rather than a router link - the target is a file, and the
 * browser's own download handling is what should take it.
 */
export function ExportPdfButton({
  applicationId,
  className,
}: {
  applicationId: string;
  className?: string;
}) {
  return (
    <Button asChild variant="outline" className={className}>
      <a
        href={`/api/applications/${applicationId}/pdf`}
        data-testid="export-pdf"
      >
        <Download className="size-4" />
        Download PDF
      </a>
    </Button>
  );
}
