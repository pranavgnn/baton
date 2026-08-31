<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MIT Promotion Application Portal

Read `README.md` first — it covers the domain model and the architecture
decisions behind it. What follows is what to keep in mind while changing code.

## Conventions

**Styling lives in `app/globals.css`.** Every colour, radius and reusable
layout belongs there as a token or a component class. Call sites use semantic
utilities (`bg-card`, `text-muted-foreground`, `.app-shell`, `.flow-node`) —
never hex values, arbitrary Tailwind values or inline styles. The one
exception is `lib/mail/`: email clients ignore stylesheets and CSS variables,
so those files inline literal colours, and that is deliberate.

React Flow's stylesheet is imported unlayered, so its overrides sit _outside_
`@layer components` at the bottom of `globals.css`. Moving them into the layer
silently breaks the theme.

**Server actions return, they do not throw.** Every action is wrapped so
failures come back as `{ ok: false, error }` (see `lib/actions.ts`) and the
client can surface a toast. Permission checks use the `*Action` helpers in
`lib/auth/session.ts`, which throw a message the wrapper converts.

**Authorisation is re-checked in the action.** Never trust that the page
already verified it — another holder of the same role may have advanced the
application since the page rendered.

**Validation runs twice.** The client validates per wizard step; the server
re-validates the whole form against the node's schema on submit. Both go
through `lib/workflow/form.ts` so the rules cannot drift.

**Never mutate a published workflow in place for a running application.**
Applications carry their own graph snapshot. If you add a field to the graph
shape, update `workflowGraphSchema` in `lib/workflow/types.ts` and make the
change tolerant of old snapshots.

## Layout

| Path                        | Contents                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `lib/workflow/`             | Domain: graph types, validation, transition engine, form-to-Zod compiler. Pure and unit-tested — keep it free of DB and React. |
| `lib/applications/`         | Queries and the transition runtime (DB writes, email dispatch, timeline).                                                      |
| `lib/auth/`                 | Better Auth config, session helpers, permission vocabulary, provisioning.                                                      |
| `lib/mail/`                 | `template.ts` is pure text (tested); `render.ts` and `layout.tsx` add the React shell.                                         |
| `components/form-runtime/`  | Renders admin-defined forms for applicants and reviewers.                                                                      |
| `components/form-builder/`  | The dnd-kit editor admins use to define those forms.                                                                           |
| `app/(app)/admin/workflow/` | React Flow canvas, custom nodes, node inspector.                                                                               |

## Before you push

```bash
pnpm typecheck && pnpm lint && pnpm test
```

`pnpm typecheck` runs `next typegen` first — `PageProps` and `LayoutProps` are
generated, so a clean checkout cannot typecheck without it.

For anything touching the workflow engine, forms, uploads or email, also run
the end-to-end suite: `pnpm e2e:setup && pnpm test:e2e`. It resets the local
database, so do not point it at data you care about.
