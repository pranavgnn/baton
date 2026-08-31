### Business Logic & Application Architecture

This platform is a fully dynamic, workflow-driven evaluation system designed to handle complex institutional promotion processes without requiring code changes for policy updates.

#### 1. Identity & Access Management (Whitelist-Only RBAC)

- **Zero Public Sign-Ups:** The system is entirely closed. Admins provision access by adding individual or shared departmental emails (e.g., `hr@institute.com`) to a whitelist and assigning them roles.
- **Dynamic Roles:** No roles are hardcoded. Admins can create, rename, or delete roles directly from the UI.
- **Onboarding Flow:** The system boots with a seeded Super Admin. New whitelisted users click "Forgot Password" to receive a secure token via email, allowing them to set their credentials and activate their account.

#### 2. Visual Workflow Orchestration (Multi-Node Types)

- **Graph-Based Pipelines:** Admins design the application flow using a visual drag-and-drop canvas.
- **Strict Entry, Non-Linear Routing:** Every workflow originates at a single "Applicant Submission" node. From there, it follows a configurable path of loops, approvals, and automated steps.
- **Stage Nodes (Manual Action):** These nodes halt the workflow and wait for human input. Clicking a Stage Node allows the Admin to assign the authorized role (e.g., `DEAN`) and construct the multi-part form required for that specific stage.
- **Email Nodes (Automated Action):** Admins drop an explicit "Send Email" node onto the canvas to trigger automated alerts. When an application hits this node, the backend immediately dispatches a customized email and automatically moves the application to the next node.

#### 3. Multi-Step Form Engine & Data Management

- **Wizard-Style Sections:** When an Admin configures multiple sections inside a Stage Node, it renders as a multi-step wizard for the user. One section is displayed per page.
- **Step-by-Step Validation:** A user cannot proceed to the next section until the current section passes strict validation rules (e.g., required fields, regex, file size limits).
- **Draft & Auto-Save:** As users progress through sections (or upon clicking "Save Draft"), the system globally saves the partially filled form data into the database. Users can safely close the browser and resume later.
- **Clear Form Option:** Users have a dedicated "Clear Form" action to wipe their current draft state and start fresh.
- **Final Preview Stage:** After completing all sections, the wizard automatically generates a read-only "Preview" page displaying the entire form. The user must review this consolidated view before executing the final submission.
- **Isolated Sub-Forms:** Reviewers (like RNC or Dean) fill out their own multi-step sub-forms. Their data is stored in isolated namespaces within the application JSON document, preserving the original applicant's data immutably.

#### 4. Email Template Engine

- **Configurable Email Templates:** Admins manage email templates via a rich-text (WYSIWYG) editor.
- **Dynamic Variable Hydration:** Admins inject dynamic placeholders (e.g., `{{applicant_name}}`, `{{current_stage}}`). When the workflow hits an Email Node, the backend hydrates these variables at runtime before sending.

---

### Technical Stack

The architecture leverages a modern Next.js ecosystem, pairing relational integrity for access control with NoSQL-like flexibility (`JSONB`) for dynamic forms and graphs.

- **Framework:** **Next.js (App Router)** for full-stack runtime, SSR, and API Server Actions.
- **Visual Canvas:** **React Flow (`@xyflow/react`)** for the interactive workflow editor, supporting custom `StageNode` and `EmailNode` components.
- **Form & Email Builders:** **`@dnd-kit/core`** for drag-and-drop form building, and **TipTap** for the admin email template rich-text editor.
- **Form Runtime & Validation:** **React Hook Form** paired with **Zod**. Zod schemas are dynamically chunked per section to support step-by-step wizard validation.
- **UI System:** **Shadcn UI + Tailwind CSS** for accessible, customizable components (steppers, modals, inputs).
- **Authentication:** **Better Auth** for whitelist-enforced password resets and session management.
- **Email Rendering:** **React Email** to render admin-configured HTML inside responsive layout shells.
- **Database & ORM:** **PostgreSQL** (via Docker Compose) with **Drizzle ORM**. Uses relational tables for RBAC and `JSONB` for workflows. Partial draft saves use Next.js Server Actions to execute `UPDATE` queries on the JSONB column.
- **File Storage:** Self-hosted **MinIO** (S3-Compatible) via Docker Compose. The Next.js backend generates pre-signed URLs for direct-to-bucket client uploads.
