/**
 * The vocabulary of the audit log.
 *
 * Stored as plain text rather than a database enum so recording a newly
 * covered action never needs a migration. This list is what the admin filter
 * offers and how each action is labelled; an entry that somehow reaches the
 * table without appearing here still displays, under its own key.
 */
export const AUDIT_ACTIONS = [
  /* Access ---------------------------------------------------------------- */
  { key: "auth.signed_in", label: "Signed in", group: "Access" },
  { key: "auth.signed_out", label: "Signed out", group: "Access" },
  { key: "auth.password_changed", label: "Password changed", group: "Access" },
  { key: "auth.password_reset", label: "Password reset", group: "Access" },
  {
    key: "auth.reset_requested",
    label: "Reset link requested",
    group: "Access",
  },

  /* Applications ---------------------------------------------------------- */
  {
    key: "application.created",
    label: "Application started",
    group: "Applications",
  },
  {
    key: "application.draft_saved",
    label: "Draft saved",
    group: "Applications",
  },
  {
    key: "application.draft_discarded",
    label: "Draft discarded",
    group: "Applications",
  },
  {
    key: "application.submitted",
    label: "Application submitted",
    group: "Applications",
  },
  {
    key: "application.reviewed",
    label: "Application reviewed",
    group: "Applications",
  },
  {
    key: "application.stage_draft_saved",
    label: "Review draft saved",
    group: "Applications",
  },
  {
    key: "application.file_uploaded",
    label: "File uploaded",
    group: "Applications",
  },
  {
    key: "application.file_downloaded",
    label: "File downloaded",
    group: "Applications",
  },
  {
    key: "application.exported",
    label: "Application exported",
    group: "Applications",
  },

  /* User and role administration ------------------------------------------ */
  { key: "user.invited", label: "User invited", group: "Administration" },
  { key: "user.updated", label: "User updated", group: "Administration" },
  { key: "user.disabled", label: "Access disabled", group: "Administration" },
  { key: "user.enabled", label: "Access restored", group: "Administration" },
  { key: "user.deleted", label: "User removed", group: "Administration" },
  { key: "user.imported", label: "Users imported", group: "Administration" },
  {
    key: "user.impersonation_started",
    label: "Impersonation started",
    group: "Administration",
  },
  {
    key: "user.impersonation_ended",
    label: "Impersonation ended",
    group: "Administration",
  },
  {
    key: "user.invite_resent",
    label: "Invitation resent",
    group: "Administration",
  },
  { key: "school.created", label: "School created", group: "Administration" },
  { key: "school.updated", label: "School updated", group: "Administration" },
  { key: "school.deleted", label: "School deleted", group: "Administration" },
  { key: "role.created", label: "Role created", group: "Administration" },
  { key: "role.updated", label: "Role updated", group: "Administration" },
  { key: "role.deleted", label: "Role deleted", group: "Administration" },
  {
    key: "role.reordered",
    label: "Role priority changed",
    group: "Administration",
  },

  /* Configuration --------------------------------------------------------- */
  {
    key: "template.created",
    label: "Email template created",
    group: "Configuration",
  },
  {
    key: "template.updated",
    label: "Email template updated",
    group: "Configuration",
  },
  {
    key: "template.deleted",
    label: "Email template deleted",
    group: "Configuration",
  },
  {
    key: "template.test_sent",
    label: "Test email sent",
    group: "Configuration",
  },
  {
    key: "workflow.draft_saved",
    label: "Workflow draft saved",
    group: "Configuration",
  },
  {
    key: "workflow.published",
    label: "Workflow published",
    group: "Configuration",
  },
  {
    key: "workflow.reverted",
    label: "Workflow draft reverted",
    group: "Configuration",
  },
  {
    key: "workflow.version_restored",
    label: "Version restored",
    group: "Configuration",
  },
  {
    key: "workflow.version_deleted",
    label: "Version deleted",
    group: "Configuration",
  },
  {
    key: "workflow.applications_opened",
    label: "Applications opened",
    group: "Configuration",
  },
  {
    key: "workflow.applications_closed",
    label: "Applications closed",
    group: "Configuration",
  },
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number]["key"];

export const AUDIT_ACTION_GROUPS = Array.from(
  new Set(AUDIT_ACTIONS.map((action) => action.group)),
);

const LABELS = new Map<string, string>(
  AUDIT_ACTIONS.map((action) => [action.key, action.label]),
);

/** Falls back to the raw key so an unrecognised action is still readable. */
export function auditActionLabel(action: string): string {
  return LABELS.get(action) ?? action;
}
