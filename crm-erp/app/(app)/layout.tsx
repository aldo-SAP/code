import { requireUser } from "@/lib/session";
import { Nav } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="shell"><Nav user={user} /><main className="main">{children}</main></div>;
}
