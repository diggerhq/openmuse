import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/cookie";
import { memoryBackend } from "@/lib/memory";
import OpenMuse from "@/app/ui/OpenMuse";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  return <OpenMuse csrf={session.csrf} memoryBackend={memoryBackend()} />;
}
