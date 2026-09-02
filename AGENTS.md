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

**A field may repeat, and it may depend on its neighbours.** A repeating group
carries its own columns and stores an array of entries; each column is an
ordinary field, so it keeps its own type and validation. Groups do not nest.
Two rule sets decide when a question applies - `visibleWhen` and
`requiredWhen`, evaluated by `lib/workflow/conditions.ts`, which is pure and
knows nothing of React or Zod. A rule may only name a sibling: a field of the
same form, or a column of the same entry. `requiredWhen` replaces the plain
`required` flag rather than adding to it, and a hidden field is never
required, never asked and never shown blank on a preview.

**Conditional validation happens after the object parses, not during it.**
Whether a field is required cannot be known until the surrounding answers are
in hand, so anything conditional is compiled optional and `withConditions` in
`lib/workflow/form.ts` adds the requirement back in a `superRefine`. The wizard
resolves against the whole form even when gating one step, which is what lets a
document in the last section depend on an answer in the fifth.

**Never mutate a published workflow in place for a running application.**
Applications carry their own graph snapshot. If you add a field to the graph
shape, update `workflowGraphSchema` in `lib/workflow/types.ts` and make the
change tolerant of old snapshots. The one exception is a draft: it has not
started moving, so `refreshDraftToPublished` re-snapshots it against the
current published version and prunes answers whose questions have gone.

**Email steps run alongside the flow, never in front of it.** An outcome may
fan out to several targets provided at most one of them continues the
application — the rest must be email nodes. `lib/workflow/engine.ts` resolves
the continuation and hands the emails to Kafka (`lib/mail/queue.ts`), which
`scripts/email-worker.ts` consumes. Publishing a job never throws and never
blocks a transition: a broker that is down records an `email_failed` event and
the application still advances.

**Editing questions is not the same permission as rewiring the flow.**
`forms.manage` may change a stage's form; `workflow.manage` may add, remove or
reconnect nodes. `saveWorkflowDraft` compares `structureSignature` before and
after to tell the two apart, so any new structural field belongs in that
signature or it becomes editable by the wrong role.

**Publishing is versioned.** Every publish writes a `workflowVersion` row with
its memo, and restoring one loads it into the draft — it does not go live until
someone publishes again.

**Every action writes an audit entry.** `recordAudit` in `lib/audit/record.ts`
is called from the action that performed the work, never from a shared wrapper:
what makes an entry worth reading is the sentence describing what happened, and
only the action knows that. It never throws - losing the record of a password
change is bad, refusing the change because of it is worse. New actions belong
in the vocabulary in `lib/audit/actions.ts`, which is what the admin filter
offers; the column is plain text, so adding one needs no migration.

**Sign-out and password changes go through `lib/audit/session.ts`.** Better
Auth handles both over its own endpoints, and by the time a sign-out has
happened there is no session left to say whose it was. The actor is resolved
server-side in either case, so the browser never asserts who it is. Sign-in is
recorded from Better Auth's own `after` hook, where the new session is on the
context.

**Long lists paginate on the client.** `usePagination` in
`components/ui/list-pagination.tsx` slices an already-loaded array, which keeps
search instant at institute scale. It is the seam to move server-side if a list
ever outgrows a single query. The audit log already has: it paginates and
filters in the query, because it is the one table that grows without bound.

**The canvas owns the steps.** `workflow-builder.tsx` keeps React Flow's node
array as the only copy and derives the domain graph from it. Anything a step
needs that its own data does not hold - the names behind its role and template
ids, whether validation flagged it - reaches the node components through the
context in `nodes.tsx`, memoised on its contents. Putting those back into node
`data` hands every step a new object whenever any of them changes, which is
what made the canvas flicker; dropping React Flow's own changes on the floor is
what made it report nodes as uninitialised.

**The seeded process is STN 023 R5, not an example.** `lib/workflow/defaults.ts`
carries the institute's real form and route: six review stages, the
seventeen-item research checklist, and one role per signing authority. It is a
starting point an admin may edit, but it is what a fresh install runs, so
changing it changes what the institute sees on day one. It now says what the paper form
says: the tables are repeating groups with typed columns, and the questions
marked conditional carry the rule that makes them so.

## Layout

| Path                         | Contents                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `lib/workflow/`              | Domain: graph types, validation, transition engine, form-to-Zod compiler. Pure and unit-tested — keep it free of DB and React. |
| `lib/applications/`          | Queries and the transition runtime (DB writes, email dispatch, timeline).                                                      |
| `lib/auth/`                  | Better Auth config, session helpers, permission vocabulary, provisioning.                                                      |
| `lib/mail/`                  | `template.ts` is pure text (tested); `render.ts` and `layout.tsx` add the React shell.                                         |
| `lib/mail/job.ts`            | The pure Kafka job contract, split from `queue.ts` so tests need no env.                                                       |
| `lib/users/import.ts`        | Pure CSV and address-list parsing for the bulk user import.                                                                    |
| `lib/audit/`                 | Audit vocabulary, the recorder, the filtered query and the CSV export. `csv.ts` and `actions.ts` are pure and unit-tested.     |
| `lib/workflow/conditions.ts` | When a question applies, given the answers around it. Pure; used by the compiler, the runtime and the preview alike.           |
| `lib/schools/`               | Schools, their dean and associate deans, and the searches that find people without listing everybody.                          |
| `components/form-runtime/`   | Renders admin-defined forms for applicants and reviewers.                                                                      |
| `components/form-builder/`   | The dnd-kit editor admins use to define those forms.                                                                           |
| `app/(app)/admin/workflow/`  | React Flow canvas, custom nodes, node inspector.                                                                               |

## Before you push

```bash
pnpm typecheck && pnpm lint && pnpm test
```

`pnpm typecheck` runs `next typegen` first — `PageProps` and `LayoutProps` are
generated, so a clean checkout cannot typecheck without it.

For anything touching the workflow engine, forms, uploads or email, also run
the end-to-end suite: `pnpm e2e:setup && pnpm test:e2e`. It resets the local
database, so do not point it at data you care about.

Email only arrives once `scripts/email-worker.ts` is running (`pnpm worker`)
against the Kafka service in `compose.yaml`.
