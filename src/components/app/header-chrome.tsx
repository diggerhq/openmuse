// The right end of every header: environment, appearance, the owner menu.
import { useNavigate } from "@tanstack/react-router";
import { LogOutIcon, RefreshCwIcon, UserIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOwner } from "@/components/app/owner-context";
import { ThemeToggle } from "@/components/app/theme-toggle";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/queries";

export function HeaderChrome() {
  const owner = useOwner();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function logout() {
    try {
      await api(owner.csrf, "/api/auth/logout", { method: "POST" });
      await navigate({ to: "/login" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out");
    }
  }

  // Upgrade or recovery: a new coordinator session on the current deployment.
  async function replaceAssistant() {
    try {
      await api(owner.csrf, "/api/conversation/replace", { method: "POST" });
      await invalidate.conversation();
      await navigate({ to: "/" });
      toast.success("Started a new assistant session from the current notes.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start a new session");
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Badge
        variant="outline"
        className="hidden font-normal text-muted-foreground sm:inline-flex"
        title="OpenComputer environment"
      >
        {owner.environment === "production" ? "Production" : "Development"}
      </Badge>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Owner menu">
            <UserIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Owner</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirmReplace(true)}>
            <RefreshCwIcon /> New assistant session…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void logout()}>
            <LogOutIcon /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new assistant session?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this after the assistant was redeployed, or if the conversation is stuck. The current session ends and
              the main conversation starts again from your profile and the topic notes; topics keep their own
              conversations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void replaceAssistant()}>Start new session</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
