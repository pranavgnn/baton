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
exceptions are `lib/mail/` and `lib/pdf/`: email clients ignore stylesheets and
CSS variables, and the PDF renderer has a stylesheet implementation of its own,
so those files carry literal colours and sizes, and that is deliberate.

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

**A form fills in what the portal already knows.** `lib/users/profile.ts` is
the single vocabulary of what an account holds - the CSV importer maps onto it,
user management edits it, and a form field names one of its keys in `prefill`
to take its answer from it. A prefilled field is read-only _when the account
has a value_ and an ordinary question when it does not, so an incomplete
service record never leaves someone unable to submit. A number field may
instead carry a `formula` over the answers beside it (`lib/workflow/calc.ts`, a
tiny expression language). Both are applied in the browser and again in the
action before validation, so a total the browser was talked into is recomputed
and a locked answer is written from the account.

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

**A role's name means nothing; its designation does.** Admins rename roles, so
schools and the workflow key off `role.designation` (`lib/auth/designations.ts`)
instead. Appointing someone dean or associate dean of a school grants them the
designated role and removing them withdraws it - reconciled wholesale in
`lib/schools/sync.ts`, so someone who signs for two schools keeps it when they
leave one. `userRole.source` is what separates a grant a posting made from one
an admin made by hand: only the former is ever taken back.

**A stage says who takes it, not who hands it over.** `assignment` on a stage
node decides whether the application is offered to everyone holding its role or
held for one person the previous reviewer names, and where those candidates
come from. Because it sits on the stage being entered, a reviewer is asked for
a name only on the branch that leads somewhere needing one - the dean when they
delegate to an associate dean, and not on a branch that goes to a whole role.
Candidates are always re-derived on the server in
`app/(app)/reviews/actions.ts`; the id the browser sends is only ever checked
against them.

**A role is institute-wide; a step need not be.** There is a dean of every
school and an application concerns exactly one of them, so a stage's
`assignment.scope` and an email step's `recipientScope` narrow the role they
name - to the holders attached to the applicant's own school (whoever signs for
it, and whoever names it as theirs), or, for a notification, to the one person
the file has just been handed to. It is a setting on the step rather than
anything inferred from the role or the designation, so an institute organised
differently configures it differently. `withinStageAudience` in
`lib/workflow/graph.ts` is pure and is asked by both the queue and the action,
and `lib/schools/query.ts` resolves the people. A snapshot published before
scopes existed carries none and still means the whole role.

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

**Impersonation swaps the session, and is Better Auth's.** The admin plugin's
`impersonateUser` creates a real session for the other person, so every query,
queue and permission check downstream sees them without knowing anything about
impersonation. Two things the plugin has no opinion on are the portal's:
`user.role` - the only thing it reads to decide who may impersonate - is
derived from `users.manage` by `lib/auth/admin-flag.ts` and is never a source
of truth (the roles a person holds are the rows in `user_role`); and
`refuseImpersonation` in `lib/auth/impersonation.ts` refuses anyone who
administers the portal in ways the actor does not, so impersonation cannot
become a way to borrow a permission. Adopting the plugin also exposes its other
endpoints (ban, set-role, remove-user) to whoever holds `users.manage`; the
portal ignores its `banned` columns and disables access with `disabled`.

Both halves are audited, and every action taken while impersonating records the
administrator behind it - `recordAudit` reads `impersonatedBy` off the actor it
is handed, so no call site has to remember.

**Sign-out and password changes go through `lib/audit/session.ts`.** Better
Auth handles both over its own endpoints, and by the time a sign-out has
happened there is no session left to say whose it was. The actor is resolved
server-side in either case, so the browser never asserts who it is. Sign-in is
recorded from Better Auth's own `after` hook, where the new session is on the
context.

**Email is not a step in an application's history.** Whether a message was
queued or delivered says nothing about where the file is, so
`ApplicationTimeline` shows only the events that moved it. Dispatch and
delivery are recorded in the audit log instead - from `advanceApplication` and
from `scripts/email-worker.ts`, which can call `recordAudit` because it
tolerates having no request around it - because "was that person ever told" is
a question about the portal, not about the application.

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
carries the institute's real form and route: seven review stages, the
seventeen-item research checklist, and one role per signing authority. It is a
starting point an admin may edit, but it is what a fresh install runs, so
changing it changes what the institute sees on day one. It says what the paper
form says: the tables are repeating groups with typed columns, and the
questions marked conditional carry the rule that makes them so. The school half
is three steps - the dean names an associate dean and writes nothing, that
person recommends, and the dean decides - both dean steps scoped to the
applicant's school. The Director's word is the last one.

**A reviewer reads before deciding.** `/reviews/[id]` opens on the file itself,
the submission and every completed review one after another, and offers the way
through to the decision at the foot of it; the decision opens with the way
back. Every outcome is confirmed by name, because an outcome closes an
application. `/reviews/history` is the other half: what this person has already
decided, keyed on who acted rather than on the role they hold.

**Who may apply is a property of the employment.** `promotionBar` in
`lib/users/profile.ts` is the whole rule - a fixed-term or probationary
appointment cannot apply - and it is asked by the page, the dashboard and both
ends of the action, since employment can change between starting a draft and
sending it. An account whose employment was never recorded is not barred.

**An application can be printed at any point.** `/api/applications/[id]/pdf`
renders whatever has been signed off so far - the submission plus each
completed review as its own signed part - laid out from the form definition
rather than from a fixed template, so it survives an admin editing the
questions. Uploaded PDFs are appended after an enclosure index and images are
drawn where they were answered.

## Layout

| Path                         | Contents                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/workflow/`              | Domain: graph types, validation, transition engine, form-to-Zod compiler. Pure and unit-tested — keep it free of DB and React.                               |
| `lib/applications/`          | Queries and the transition runtime (DB writes, email dispatch, timeline).                                                                                    |
| `lib/auth/`                  | Better Auth config, session helpers, permission vocabulary, provisioning.                                                                                    |
| `lib/mail/`                  | `template.ts` is pure text (tested); `render.ts` and `layout.tsx` add the React shell.                                                                       |
| `lib/mail/job.ts`            | The pure Kafka job contract, split from `queue.ts` so tests need no env.                                                                                     |
| `lib/users/profile.ts`       | The vocabulary of an account: its fields, how a CSV maps onto them, and who may apply for a promotion.                                                       |
| `lib/users/import.ts`        | Pure CSV and address-list parsing for the bulk user import.                                                                                                  |
| `lib/audit/`                 | Audit vocabulary, the recorder, the filtered query and the CSV export. `csv.ts` and `actions.ts` are pure and unit-tested.                                   |
| `lib/workflow/conditions.ts` | When a question applies, given the answers around it. Pure; used by the compiler, the runtime and the preview alike.                                         |
| `lib/schools/`               | Schools, their dean and associate deans, and the searches that find people without listing everybody. `sync.ts` reconciles the roles those posts carry.      |
| `lib/auth/designations.ts`   | Which role stands for which standing post, and how a grant records where it came from.                                                                       |
| `lib/pdf/`                   | `model.ts` turns a form and its answers into a printable model (pure, tested); `document.tsx` draws it; `render.tsx` fetches the enclosures and merges them. |
| `components/form-runtime/`   | Renders admin-defined forms for applicants and reviewers.                                                                                                    |
| `components/form-builder/`   | The dnd-kit editor admins use to define those forms.                                                                                                         |
| `app/(app)/admin/workflow/`  | React Flow canvas, custom nodes, node inspector.                                                                                                             |

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
