// Every screen behind the owner login: the sidebar, the header and one
// conversation at a time. The owner context (CSRF token, environment) is
// read on the server during navigation and handed to the shell.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { getOwnerContext } from "@/lib/owner";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const owner = await getOwnerContext();
    if (!owner) throw redirect({ to: "/login" });
    return { owner };
  },
  component: AppLayout,
});

function AppLayout() {
  const { owner } = Route.useRouteContext();
  return (
    <AppShell owner={owner}>
      <Outlet />
    </AppShell>
  );
}
