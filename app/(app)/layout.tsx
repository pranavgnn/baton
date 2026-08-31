import { AppNav, type NavLink } from "@/components/app-nav";
import { can, canAny, requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const current = await requireUser();

  const links: NavLink[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  ];

  if (can(current, "applications.apply")) {
    links.push({
      href: "/application",
      label: "My Application",
      icon: "application",
    });
  }
  if (can(current, "applications.review")) {
    links.push({ href: "/reviews", label: "Reviews", icon: "reviews" });
  }
  if (can(current, "applications.viewAll")) {
    links.push({
      href: "/applications",
      label: "All Applications",
      icon: "all",
    });
  }
  if (
    canAny(current, [
      "admin.access",
      "users.manage",
      "roles.manage",
      "workflow.manage",
      "templates.manage",
    ])
  ) {
    links.push({ href: "/admin", label: "Admin", icon: "admin" });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav
        links={links}
        user={{
          name: current.name,
          email: current.email,
          roles: current.roles.map((role) => role.name),
        }}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
