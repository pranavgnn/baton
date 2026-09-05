"use client";

import {
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  User,
} from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/logo";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";

import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { ModeToggle } from "@/components/mode-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { signOutAndRecord } from "@/lib/audit/session";
import { cn } from "@/lib/utils";

export type NavLink = {
  href: Route;
  label: string;
  icon: "dashboard" | "application" | "reviews" | "all" | "admin";
};

const ICONS: Record<NavLink["icon"], ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  application: FileText,
  reviews: ClipboardList,
  all: ClipboardList,
  admin: Settings,
};

export type AppNavProps = {
  links: NavLink[];
  user: { id?: string; name: string; email: string; roles: string[] };
  /**
   * True while an administrator is acting as this person. Better Auth's own
   * endpoints answer to the real session underneath, so changing a password
   * here would change the administrator's - the menu hides it rather than
   * offering something that would do the wrong thing.
   */
  impersonating?: boolean;
};

export function AppNav({ links, user, impersonating = false }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  async function handleSignOut() {
    await signOutAndRecord();
    router.push("/sign-in");
    router.refresh();
  }

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="app-shell-wide flex h-14 items-center gap-4 py-0">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo className="size-6" />
          <span className="hidden text-sm leading-tight font-semibold sm:block">
            Baton
          </span>
        </Link>

        <nav
          aria-label="Main"
          className="hidden flex-1 items-center gap-1 md:flex"
        >
          {links.map((link) => {
            const Icon = ICONS[link.icon];
            return (
              <Button
                key={link.href}
                asChild
                variant={isActive(link.href) ? "secondary" : "ghost"}
                size="sm"
              >
                <Link href={link.href}>
                  <Icon className="size-4" />
                  {link.label}
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ModeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Account menu"
                className="rounded-full"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">
                    {initials || "?"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="flex flex-col gap-1">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
                {user.roles.length > 0 ? (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-xs">
                        {role}
                      </Badge>
                    ))}
                  </span>
                ) : null}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {impersonating ? null : (
                <>
                  <DropdownMenuItem asChild>
                    <Link
                      href={user.id ? `/users/${user.id}` : "/profile"}
                      data-testid="nav-view-profile"
                    >
                      <User className="size-4" />
                      View profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPasswordOpen(true)}
                    data-testid="change-password"
                  >
                    <KeyRound className="size-4" />
                    Change password
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="size-4" />
                    Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation"
                className="md:hidden"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                {links.map((link) => {
                  const Icon = ICONS[link.icon];
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                        isActive(link.href) && "bg-secondary font-medium",
                      )}
                    >
                      <Icon className="size-4" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      {impersonating ? null : (
        <ChangePasswordDialog
          open={passwordOpen}
          onOpenChange={setPasswordOpen}
        />
      )}
    </header>
  );
}
