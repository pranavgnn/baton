import { canAny, requireAnyPermission } from "@/lib/auth/session";
import { AdminTabs, type AdminTab } from "./admin-tabs";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const current = await requireAnyPermission([
    "admin.access",
    "users.manage",
    "roles.manage",
    "workflow.manage",
    "forms.manage",
    "templates.manage",
    "audit.view",
  ]);

  const tabs: AdminTab[] = [{ href: "/admin", label: "Overview" }];
  if (canAny(current, ["workflow.manage", "forms.manage"])) {
    tabs.push({ href: "/admin/workflow", label: "Workflow" });
  }
  if (canAny(current, ["templates.manage"])) {
    tabs.push({ href: "/admin/templates", label: "Email templates" });
  }
  if (canAny(current, ["users.manage"])) {
    tabs.push({ href: "/admin/users", label: "Users" });
  }
  if (canAny(current, ["roles.manage"])) {
    tabs.push({ href: "/admin/roles", label: "Roles" });
  }
  if (canAny(current, ["audit.view"])) {
    tabs.push({ href: "/admin/audit", label: "Audit log" });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminTabs tabs={tabs} />
      {children}
    </div>
  );
}
