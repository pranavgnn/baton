import { cn } from "@/lib/utils";

/**
 * The mark: a baton mid-hand-off, which is what the portal does with an
 * application.
 *
 * Drawn rather than loaded, so it inherits the current colour and stays sharp
 * at any size - and so a fork can replace one file instead of hunting for an
 * image.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={cn("size-6", className)}
      aria-hidden
    >
      <path d="M7.5 16.5 16.5 7.5" />
      <circle cx="4.5" cy="19.5" r="2.5" />
      <circle cx="19.5" cy="4.5" r="2.5" />
    </svg>
  );
}
