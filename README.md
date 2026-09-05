<p align="center">
  <img src="docs/logo.svg" alt="" width="88" height="88">
</p>

<h1 align="center">Baton</h1>

<p align="center"><strong>Applications that pass from hand to hand.</strong></p>

Baton is a self-hosted portal for any process where a form is submitted, read
by several people in turn, and decided. Promotions, grant requests, purchase
approvals, leave, access requests, ethics review — the shape is always the
same, and it is usually rebuilt from scratch every time.

Here it is configuration. Who reviews what, in which order, what each person is
asked, which branches close the file and which emails go out are all drawn and
edited in the admin UI. A policy change needs no code change and no deployment.

The example process a fresh install ships with is exactly that — an example.
Replace it.

---

## What it does

**Whitelist-only access.** There is no public sign-up. An administrator adds an
address (a person's, or a shared mailbox like `records@example.org`), assigns
roles, and the holder activates the account from an emailed link.

**Roles are data, not code.** Create, rename and delete roles from the UI, and
grant each one capabilities from a fixed permission vocabulary. Roles are
ordered by dragging; the one at the top is what somebody gets when an invite or
an import names no role. A seeded super admin holds everything, so the portal
cannot lock itself out.

Editing forms is a separate permission from rewiring the process: somebody can
be trusted to change the questions on a step without being able to add, remove
or reconnect steps.

**A visual workflow builder.** The process is a graph drawn on a canvas:

| Node           | Behaviour                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Submission** | The single entry point. Holds the form the applicant fills in.                                                                                                  |
| **Stage**      | Halts until somebody acts. Each named outcome (_Approve_, _Return for changes_, _Decline_, …) is its own connector, so different decisions lead somewhere else. |
| **Send Email** | Queues a templated message. A leaf: delivery is asynchronous, so it hangs off the side of a path rather than sitting in it.                                     |
| **End**        | Closes the application as approved, rejected or withdrawn.                                                                                                      |

Because outcomes are separate connectors the graph supports loops — a _Return
for changes_ outcome puts the application back in its author's hands. An
outcome may fan out to several nodes: exactly one carries the application
forward and the rest must be email, dispatched alongside it, so a slow mail
server can never delay a review.

**Steps know who they belong to.** A stage is offered to everyone holding its
role, or held for one person the previous reviewer names. Either can be
narrowed to the applicant's own department, so the head of one department never
sees another's queue — without inventing a role per department. The same
narrowing applies to notifications: "tell the head" can mean the head of that
department, and "tell the assessor" can mean the one person the file was just
handed to.

**A form builder with real field types.** Text, numbers, dates, phone, email,
choices, checkboxes, uploads, headings and prose — plus:

- **repeating groups**, whose columns are ordinary typed fields, for the tables
  every paper form has;
- **conditional questions**, shown or required only when a sibling answer says
  so;
- **prefilled answers**, taken from the applicant's account and read-only when
  the portal already knows them — and an ordinary question when it does not;
- **computed answers**, worked out from the answers beside them with a tiny
  formula language, in the browser and again on the server.

**A wizard that behaves.** One section per page, validation before each step,
autosave, a full read-only preview before submission, and a rail showing where
you are. Reviewers fill their own forms, stored in isolated namespaces so the
applicant's submission is never overwritten.

**Reviewing is reading first.** The review page opens on the file — the
submission and every completed review, one after another — and offers the way
through to the decision at the foot of it. Outcomes are confirmed by name.
Reviewers keep a searchable history of everything they have decided.

**Applicants see the whole process.** The tracking page draws the real graph:
every step the application can pass through, the route it has taken
highlighted, and a marker on where it sits now.

**Email templates** are authored in a rich-text editor with `{{placeholders}}`
hydrated from live application data at send time.

**Print the file at any point.** A PDF of the submission plus every completed
review, laid out from the form definition rather than a fixed template, with
uploaded PDFs appended and images drawn where they were answered.

**An audit log** of every action, filterable and exportable, including who was
really behind an action taken while impersonating somebody.

**Impersonation**, for the support question that starts "it does not work for
me" — with a rule that stops an administrator borrowing a permission they do
not have.

---

## Stack

| Concern            | Choice                                                            |
| ------------------ | ----------------------------------------------------------------- |
| Framework          | Next.js 16 (App Router, Server Actions)                           |
| UI                 | shadcn/ui + Tailwind CSS v4                                       |
| Canvas             | React Flow (`@xyflow/react`)                                      |
| Form builder       | `@dnd-kit`                                                        |
| Rich text          | TipTap                                                            |
| Forms & validation | React Hook Form + Zod                                             |
| Auth               | Better Auth                                                       |
| Database           | PostgreSQL + Drizzle ORM (`JSONB` for graphs and form data)       |
| Files              | S3-compatible storage, pre-signed direct-to-bucket uploads        |
| Email              | Kafka queue + worker, React Email + Nodemailer, Mailpit for local |
| PDF                | `@react-pdf/renderer` + `pdf-lib`                                 |

Every colour, radius and reusable layout lives in
[`app/globals.css`](app/globals.css). Components use semantic utilities
(`bg-card`, `.app-shell`, `.flow-node`) rather than hardcoded values, so the
whole look can be retuned from that one file.

---

## Quick start

Requirements: Node 22+, pnpm 11+, Docker.

```bash
git clone https://github.com/<you>/baton.git
cd baton
pnpm install
cp .env.example .env          # sane local defaults, no edits needed
pnpm compose:up               # Postgres, MinIO, Mailpit and Kafka
pnpm db:migrate
pnpm seed                     # roles, departments, templates, workflow, admin
pnpm seed:demo                # optional: one demo account per role
pnpm dev                      # Next.js and the email worker together
```

| Service                      | URL                                                 |
| ---------------------------- | --------------------------------------------------- |
| Portal                       | http://localhost:3000                               |
| Mailpit (all outgoing email) | http://localhost:8025                               |
| MinIO console                | http://localhost:9001 (`minioadmin` / `minioadmin`) |
| Kafka broker                 | localhost:9092                                      |

Sign in as `admin@example.org` / `SuperAdmin@123`.

The demo seed adds one account per role in the example process — `applicant@`,
`head@`, `deputy@`, `deputy2@`, `compliance@`, `approver@` and
`records@example.org` — all with the password `Portal@123`. Sign in as each to
walk an application from one end to the other.

Nothing leaves the machine in development: Mailpit captures every message.

---

## Making it yours

The seed is a starting point, not a specification. In the admin area:

1. **Departments** — replace the examples with your own structure, and name the
   head and deputies of each.
2. **Roles** — rename them to what you call them, and say which role stands for
   "head of a department" and "deputy" so postings can grant them automatically.
3. **Workflow** — redraw the graph: add stages, name their outcomes, wire the
   branches, attach email steps. Publish when the canvas reports no problems.
4. **Forms** — edit the questions on the submission step and on each stage.
5. **Templates** — rewrite the emails in your own voice.

Nothing in [`lib/workflow/defaults.ts`](lib/workflow/defaults.ts) is depended on
by the engine; it only decides what a fresh database contains.

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
validation, the transition engine, the form-to-Zod compiler for every field
type, conditions, the formula language, CSV import, template hydration and HTML
sanitisation, the PDF model and permission resolution.

```bash
pnpm test
```

**End-to-end tests** drive a real browser against a real Postgres, S3 and SMTP
sink — no mocks. They cover the authentication and authorisation boundaries,
both builders, administration, and the whole lifecycle of an application:
submit → sent back → resubmit → assess → decide → check → approve, asserting
the emails each step should produce.

```bash
pnpm e2e:setup      # resets the database - development only
pnpm test:e2e
```

CI runs formatting, lint, types, unit tests, a production build and the full
end-to-end suite on every push and pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

---

## How it works

**Applications snapshot the workflow.** Creating an application stores a copy
of the published graph, so the process can be edited and republished at any
time without changing the questions or the route of anything already in flight.
Publishing bumps a version and records the memo; any version can be restored
onto the canvas as a draft.

The exception is a draft nobody has submitted: it has not entered the process
yet, so it is brought onto the current published workflow when its author next
opens it. Answers to questions that still exist are kept; answers to questions
that were removed are dropped.

**Form data is namespaced.** An application's `data` column holds the
applicant's answers under `applicant` and every reviewer's answers under their
stage's node id, so a reviewer can never overwrite the submission.

**Queues are role-scoped and first-to-act.** Everyone the step is offered to
sees it; whoever records an outcome first advances it. Authorisation is
re-checked at the moment of the action, so the second reviewer gets a clear
message rather than a silent double-write. Each reviewer's in-progress form is
a private draft keyed by application, step and person.

**Email never blocks a transition.** A transition publishes a job to Kafka and
returns; the worker renders the template and sends it. Dispatch and delivery are
recorded in the audit log rather than in the application's own history, because
whether a message was delivered says nothing about where the file is. A broker
that is down is recorded too — the review still moves on.

**Uploads never pass through the app server.** The browser gets a short-lived
pre-signed `PUT` and uploads straight to the bucket; the server then confirms
the object exists before trusting the reference. Downloads are pre-signed
redirects behind the same visibility rules as the application itself.

**Validation runs twice, deliberately.** The browser validates each step for
fast feedback; the server re-validates the whole form against the step's schema
on submit, because the browser is not trustworthy. Prefilled and computed
answers are applied again on the server for the same reason.

---

## Configuration

`.env.example` documents every variable. The ones that matter in production:

| Variable                                 | Notes                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                           | PostgreSQL connection string                                                                                               |
| `BETTER_AUTH_SECRET`                     | Generate with `openssl rand -base64 32`                                                                                    |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | The portal's public origin                                                                                                 |
| `SMTP_*`, `MAIL_FROM`                    | A real relay instead of Mailpit                                                                                            |
| `KAFKA_BROKERS`                          | Comma-separated broker list for the email queue                                                                            |
| `S3_*`                                   | Bucket and credentials; set `S3_PUBLIC_ENDPOINT` when the browser reaches storage on a different host than the server does |
| `SUPER_ADMIN_*`                          | Only read by `pnpm seed`                                                                                                   |

The environment is parsed once at boot ([`lib/env.ts`](lib/env.ts)), so a
misconfigured deployment fails immediately rather than at the first request
that happens to need the missing value.

CORS for direct browser uploads is set on the MinIO container through
`MINIO_API_CORS_ALLOW_ORIGIN` in [`compose.yaml`](compose.yaml) — MinIO does not
implement the S3 `PutBucketCors` API. On real S3, configure the bucket policy
out of band.

Deploying it: build with `pnpm build`, apply migrations with `pnpm db:migrate`,
run `pnpm start` and `pnpm worker` as two processes, and point them at a
Postgres, an S3-compatible bucket, a Kafka broker and an SMTP relay.

---

## Contributing

Issues and pull requests are welcome.

Before pushing:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

For anything touching the workflow engine, forms, uploads or email, run the
end-to-end suite as well.

[`AGENTS.md`](AGENTS.md) is the guide to the conventions this codebase holds
itself to — where styling lives, why server actions return instead of throwing,
why validation runs twice, what may and may not be changed about a published
workflow. It is worth reading before a first pull request. In short: comments
explain _why_, the domain layer in `lib/workflow/` stays free of React and the
database, and every user-facing string is written for the person reading it.

---

## License

[MIT](LICENSE).
