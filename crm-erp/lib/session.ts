import { cookies, headers } from "next/headers";
import { safeNext } from "./nexturl.ts";
import { redirect } from "next/navigation";
import { userFromSession, SESSION_COOKIE, can, type User } from "./auth.ts";

export async function currentUser(): Promise<User | null> {
  return await userFromSession((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireUser(check?: (u: User) => boolean): Promise<User> {
  const u = await currentUser();
  if (!u) {
    const next = safeNext((await headers()).get("x-pathname"));
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  if (check && !check(u)) redirect("/forbidden");
  return u;
}
export const requireManager = () => requireUser(can.manage);
export const requireAdmin = () => requireUser(can.admin);
