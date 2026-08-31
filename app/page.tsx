import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

export default async function RootPage() {
  const current = await getCurrentUser();
  redirect(current ? "/dashboard" : "/sign-in");
}
