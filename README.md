# MIT Promotion Application Portal

An internal, whitelist-only portal for Manipal Institute of Technology staff to
apply for promotion, and for the institute to run the review process that
follows. The whole pipeline — who reviews what, in which order, what each
person is asked, and which emails go out — is configured from the admin UI. A
policy change needs no code change and no deployment.

---

## What it does

**Whitelist-only access.** There is no public sign-up. Admins add an
institute address (individual or a shared departmental mailbox such as
`hr@manipal.edu`), assign roles, and the holder activates the account through
an emailed link.

**Roles are data, not code.** Admins create, rename and delete roles from the
UI and grant each one capabilities from a fixed permission vocabulary. Roles
are ordered by dragging, and the one at the top is the default a user is given
when an invite or a bulk import names none. A seeded Super Admin holds
everything so the portal can never lock itself out.

Editing forms is a separate permission from managing the workflow: someone can
be trusted to change the questions on a step without being able to add, remove
or rewire steps.

**Users can be added in bulk**, as a CSV or a pasted list of addresses, with a
preview showing per-row errors and duplicates before anything is written.

**Visual workflow builder.** The process is a graph drawn on a canvas:

| Node                     | Behaviour                                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Applicant Submission** | The single entry point. Holds the form the applicant fills in.                                                                                                                                     |
| **Stage**                | Halts the workflow until a holder of the assigned role acts. Each named outcome (_Recommend_, _Send back_, _Reject_, …) is its own connector, so different decisions lead to different next steps. |
| **Send Email**           | Queues a templated message. A leaf: delivery is asynchronous, so it hangs off the side of a path rather than sitting in it.                                                                        |
| **End**                  | Closes the application as approved, rejected or withdrawn.                                                                                                                                         |

Because outcomes are separate connectors, the graph supports loops — a _Send
back_ outcome returns the application to the submission node, putting it back
in the applicant's hands.

An outcome may fan out to several nodes: exactly one carries the application
forward, and any others must be email nodes, dispatched in parallel. Email
never sits between two stages, so a slow mail server cannot delay a review.

**Applicants see the whole process.** The tracking page draws the actual
workflow graph, read-only: every step the application can pass through, the
route it has taken highlighted, and a marker on where it sits now. Loops render
as loops because it is the real graph rather than a flattened stepper. Email
steps are left out - they are notifications, not places an application goes.

**Multi-step form engine.** Each section of a node's form becomes one page of
a wizard. A section must pass validation before the user can continue, drafts
save automatically, and a read-only preview of every answer is shown before
final submission. Reviewers fill their own sub-forms, stored in isolated
namespaces so the applicant's submission is never mutated.

**Email templates.** Authored in a rich-text editor with `{{placeholders}}`
that are hydrated with live application data at send time, then wrapped in a
responsive branded shell.

---

## Stack

| Concern            | Choice                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| Framework          | Next.js 16 (App Router, Server Actions)                                  |
| UI                 | shadcn/ui + Tailwind CSS v4                                              |
| Canvas             | React Flow (`@xyflow/react`)                                             |
| Form builder       | `@dnd-kit`                                                               |
| Rich text          | TipTap                                                                   |
| Forms & validation | React Hook Form + Zod                                                    |
| Auth               | Better Auth                                                              |
| Database           | PostgreSQL + Drizzle ORM (relational RBAC, `JSONB` graphs and form data) |
| Files              | MinIO (S3-compatible), pre-signed direct-to-bucket uploads               |
| Email              | Kafka queue + worker, React Email + Nodemailer, Mailpit in development   |

All design tokens and reusable layout classes live in
[`app/globals.css`](app/globals.css). Components reference semantic utilities
(`bg-card`, `.app-shell`, `.flow-node`) rather than hardcoding values, so the
entire look of the portal can be retuned from that one file.

---

## Getting started

Requirements: Node 22+, pnpm 11+, Docker.

```bash
pnpm install
cp .env.example .env          # sane local defaults, no edits needed
pnpm compose:up               # Postgres, MinIO, Mailpit and Kafka
pnpm db:migrate
pnpm seed                     # roles, templates, workflow, super admin
pnpm seed:demo                # optional: demo accounts for each role
pnpm dev                      # Next.js and the email worker together
```

| Service                      | URL                                                 |
| ---------------------------- | --------------------------------------------------- |
| Portal                       | http://localhost:3000                               |
| Mailpit (all outgoing email) | http://localhost:8025                               |
| MinIO console                | http://localhost:9001 (`minioadmin` / `minioadmin`) |
| Kafka broker                 | localhost:9092                                      |

Sign in as `superadmin@manipal.edu` / `SuperAdmin@123`. The demo seed adds
`faculty@`, `hod@`, `dean@` and `registrar@manipal.edu`, all with the password
`Portal@123`.

Nothing leaves the machine in development: Mailpit captures every email, so
the activation and workflow messages can be read at
<http://localhost:8025>.

---

## Scripts

| Command                                        | Purpose                                    |
| ---------------------------------------------- | ------------------------------------------ |
| `pnpm dev`                                     | Dev server plus the email worker           |
| `pnpm dev:next` / `pnpm worker`                | Either half on its own                     |
| `pnpm build` / `pnpm start`                    | Production build and server                |
| `pnpm compose:up` / `compose:down`             | Local service stack                        |
| `pnpm db:generate`                             | Generate a migration from schema changes   |
| `pnpm db:migrate`                              | Apply migrations                           |
| `pnpm db:reset`                                | Drop everything and re-migrate             |
| `pnpm db:studio`                               | Drizzle Studio                             |
| `pnpm seed` / `pnpm seed:demo`                 | Bootstrap data / demo accounts             |
| `pnpm test`                                    | Unit tests (Vitest)                        |
| `pnpm test:e2e`                                | End-to-end tests (Playwright)              |
| `pnpm e2e:setup`                               | Reset and seed the database for an E2E run |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Quality gates                              |

---

## Testing

**Unit tests** cover the parts where a mistake is silent and expensive: graph
validation, the transition engine (including email chains and loop
protection), the dynamic form-to-Zod compiler for every field type, template
hydration and HTML sanitisation, and permission resolution.

```bash
pnpm test
```

**End-to-end tests** drive a real browser against a real Postgres, MinIO and
SMTP sink — no mocks. They cover authentication and authorisation boundaries,
the workflow and form builders, role/user/template administration, and the
complete application lifecycle: submit → send back → resubmit → recommend →
approve, asserting the emails that each step should produce.

```bash
pnpm e2e:setup      # resets the database - development only
pnpm test:e2e
```

CI runs formatting, lint, types, unit tests, a production build and the full
E2E suite on every push and pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

---

## Architecture notes

**Applications snapshot the workflow.** When an application is created it
stores a copy of the published graph. Admins can edit and republish the
workflow at any time without changing the questions or the route of anything
already in flight. Publishing bumps a version and records the revision, with
the memo the publisher left; any revision can be restored onto the canvas as
the draft.

The one exception is a draft that has not been submitted: it has not entered
the process yet, so it is brought onto the current published workflow when the
applicant next opens it. Answers to questions that still exist are kept, and
answers to questions that were removed are dropped.

**Form data is namespaced.** An application's `data` column holds the
applicant's answers under `applicant`, and every reviewer's answers under
their stage's node id. The applicant's submission is never overwritten by a
reviewer.

**Reviewer queues are role-scoped, first-to-act.** Every holder of a stage's
role sees the application; whoever submits an outcome first advances it.
Authorisation is re-checked at the moment of the action, so a second reviewer
gets a clear message rather than a silent double-write. Each reviewer's
in-progress form is a private draft keyed by application, node and user.

**Email never blocks a transition.** A transition publishes a job to Kafka and
returns; `pnpm worker` renders the template and sends it. The timeline records
the hand-off to the queue and, later, what became of it. If the broker itself is
unreachable that is recorded against the application too — the review still
moves on.

**Uploads never pass through the app server.** The browser gets a short-lived
pre-signed `PUT` and uploads straight to the bucket; the server then confirms
the object really exists before trusting the reference. Downloads are
pre-signed redirects gated by the same visibility rules as the application.

**Validation runs twice, deliberately.** The client validates per wizard step
for fast feedback; the server re-validates the whole form against the node's
schema on submit, because the client is not trustworthy.

---

## Configuration

`.env.example` documents every variable. The ones that matter in production:

| Variable                                 | Notes                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                           | PostgreSQL connection string                                                                                               |
| `BETTER_AUTH_SECRET`                     | Generate with `openssl rand -base64 32`                                                                                    |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | The portal's public origin                                                                                                 |
| `SMTP_*`, `MAIL_FROM`                    | Real relay instead of Mailpit                                                                                              |
| `KAFKA_BROKERS`                          | Comma-separated broker list for the email queue                                                                            |
| `S3_*`                                   | Bucket and credentials; set `S3_PUBLIC_ENDPOINT` when the browser reaches storage on a different host than the server does |
| `SUPER_ADMIN_*`                          | Only read by `pnpm seed`                                                                                                   |

The environment is parsed and validated once at boot
([`lib/env.ts`](lib/env.ts)), so a misconfigured deployment fails immediately
rather than at the first request that happens to need the missing value.

CORS for direct browser uploads is set on the MinIO container via
`MINIO_API_CORS_ALLOW_ORIGIN` in [`compose.yaml`](compose.yaml) — MinIO does
not implement the S3 `PutBucketCors` API. On real S3, configure the bucket CORS
policy out of band.
