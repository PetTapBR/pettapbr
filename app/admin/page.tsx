import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_COOKIE_NAME, isValidAdminSessionToken } from "@/lib/admin-auth";
import { AdminPanelClient } from "@/app/admin/admin-panel-client";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;

  if (!isValidAdminSessionToken(token)) {
    redirect("/login?next=/admin");
  }

  return <AdminPanelClient />;
}
