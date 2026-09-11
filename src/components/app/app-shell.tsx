// The app frame: a collapsible sidebar (a sheet on narrow screens), the
// command palette, and the selected conversation as children.
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { CommandPalette } from "@/components/app/command-palette";
import { OwnerProvider } from "@/components/app/owner-context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { usePersistedState } from "@/lib/client/persisted";
import type { OwnerContext } from "@/lib/owner";

export function AppShell({ owner, children }: { owner: OwnerContext; children: ReactNode }) {
  const [open, setOpen] = usePersistedState<boolean>("sidebar", true);
  return (
    <OwnerProvider value={owner}>
      <SidebarProvider open={open} onOpenChange={setOpen} className="h-svh overflow-hidden">
        <AppSidebar />
        <SidebarInset className="h-svh min-w-0 overflow-hidden">{children}</SidebarInset>
        <CommandPalette />
      </SidebarProvider>
    </OwnerProvider>
  );
}
