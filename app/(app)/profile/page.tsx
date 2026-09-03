import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";

export default async function ProfileRedirectPage() {
  const current = await requireUser();
  redirect(`/users/${current.id}`);
}
