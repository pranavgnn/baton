"use client";

import {
  Eye,
  Loader2,
  MailCheck,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { userTypeLabel } from "@/lib/users/profile";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteUser,
  impersonateUser,
  resendInvite,
  setUserDisabled,
} from "./actions";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  schoolId: string;
  schoolName: string;
  designation: string;
  institution: string;
  userType: string;
  dateOfBirth: string;
  dateOfJoining: string;
  dateOfLastPromotion: string;
  phone: string;
  personalEmail: string;
  address: string;
  activated: boolean;
  disabled: boolean;
  createdAt: string;
  roles: { id: string; name: string }[];
};

export type RoleOption = { id: string; name: string };
export type SchoolOption = { id: string; name: string };

export function UsersManager({
  users,
  currentUserId,
  openEmail,
}: {
  users: UserRow[];
  roles: RoleOption[];
  schools: SchoolOption[];
  currentUserId: string;
  /** Someone another page linked here to look at, by address. */
  openEmail?: string | null;
}) {
  const [query, setQuery] = useState(openEmail ?? "");
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);
  const [isBusy, startBusy] = useTransition();
  const router = useRouter();

  // Listen for cross-tab user provisioning updates
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("portal_users");
      channel.onmessage = (event) => {
        if (event.data?.type === "users_updated") {
          router.refresh();
        }
      };
    } catch {
      // BroadcastChannel not available
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === "portal_users_updated") {
        router.refresh();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [router]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((item) =>
      [item.name, item.email, item.employeeId, item.schoolName]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [users, query]);

  const pagination = usePagination(filtered, 25);

  function runAction(
    label: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    startBusy(async () => {
      const result = await action();
      if (result.ok) toast.success(label);
      else toast.error(result.error ?? "Something went wrong.");
    });
  }

  return (
    <>
      <div className="toolbar justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, employee ID or school"
            className="pl-8"
            aria-label="Search users"
          />
        </div>
        <div className="toolbar">
          <Button asChild variant="outline" data-testid="bulk-import">
            <Link href="/admin/users/whitelist?tab=import">
              <Upload className="size-4" />
              Import
            </Link>
          </Button>
          <Button asChild data-testid="invite-user">
            <Link href="/admin/users/whitelist">
              <UserPlus className="size-4" />
              Add to whitelist
            </Link>
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>School</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-3 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="empty-state border-0">
                      No users match that search.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pagination.items.map((item) => (
                  <TableRow key={item.id} data-testid={`user-${item.email}`}>
                    <TableCell>
                      {/* The whole account opens from the name in a new tab */}
                      <Link
                        href={`/users/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="row-opener inline-block text-left"
                        data-testid={`open-user-${item.email}`}
                      >
                        <span className="font-medium hover:underline">
                          {item.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {item.email}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {item.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            None
                          </span>
                        ) : (
                          item.roles.map((r) => (
                            <Badge key={r.id} variant="secondary">
                              {r.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.schoolName || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {userTypeLabel(item.userType)}
                    </TableCell>
                    <TableCell>
                      {item.disabled ? (
                        <Badge variant="destructive">Disabled</Badge>
                      ) : item.activated ? (
                        <Badge variant="outline">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Invited</Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${item.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/users/${item.id}?edit=true`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Pencil className="size-4" />
                              Edit details and roles
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              runAction("Activation link sent.", () =>
                                resendInvite(item.id),
                              )
                            }
                          >
                            <MailCheck className="size-4" />
                            {item.activated
                              ? "Send password reset"
                              : "Resend activation link"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              item.id === currentUserId || item.disabled
                            }
                            data-testid={`impersonate-${item.email}`}
                            onClick={() =>
                              startBusy(async () => {
                                const result = await impersonateUser(item.id);
                                if (!result.ok) {
                                  toast.error(result.error);
                                  return;
                                }
                                toast.success(
                                  `You are now viewing as ${item.name}.`,
                                );
                                router.push("/dashboard");
                                router.refresh();
                              })
                            }
                          >
                            <Eye className="size-4" />
                            View as this user
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={item.id === currentUserId}
                            onClick={() =>
                              runAction(
                                item.disabled
                                  ? "Account re-enabled."
                                  : "Account disabled.",
                                () => setUserDisabled(item.id, !item.disabled),
                              )
                            }
                          >
                            {item.disabled
                              ? "Re-enable access"
                              : "Disable access"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={item.id === currentUserId}
                            onClick={() => setPendingDelete(item)}
                          >
                            <Trash2 className="size-4" />
                            Remove from whitelist
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ListPagination pagination={pagination} label="users" />

      {/* Delete User Confirmation Dialog */}
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}? </AlertDialogTitle>
            <AlertDialogDescription>
              Their access is revoked immediately. Accounts with applications on
              record cannot be removed — disable them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy}
              onClick={(event) => {
                event.preventDefault();
                const target = pendingDelete;
                if (!target) return;
                startBusy(async () => {
                  const result = await deleteUser(target.id);
                  if (result.ok) {
                    toast.success("User removed.");
                    setPendingDelete(null);
                  } else {
                    toast.error(result.error);
                  }
                });
              }}
            >
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Remove user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
