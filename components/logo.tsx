import { cn } from "@/lib/utils";

/**
 * The mark: a baton mid-hand-off, which is what the portal does with an
 * application. Two hands and the line between them, on a 24x24 grid.
 *
 * Drawn rather than loaded, so it inherits the current colour and stays sharp
 * at any size - and so a fork can replace one file instead of hunting for an
 * image. `app/icon.svg` is the same geometry with the colours written out,
 * because a favicon has no stylesheet to inherit from.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-6", className)}
      aria-hidden
    >
      <circle cx="5.5" cy="18.5" r="2.5" />
      <path d="M8.33 15.67 15.67 8.33" />
      <circle cx="18.5" cy="5.5" r="2.5" />
    </svg>
  );
}
