import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · OpenMuse" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (response.ok) {
        await navigate({ to: "/" });
        return;
      }
      setError(
        response.status === 429
          ? "Too many attempts. Wait 15 minutes and try again."
          : response.status === 401
            ? "That secret is not right."
            : `Sign-in failed (${response.status}).`,
      );
    } catch {
      setError("Sign-in failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      setSecret("");
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">OpenMuse</h1>
          <p className="text-sm text-muted-foreground">Sign in with the owner secret from setup.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="secret">Owner secret</Label>
          <Input
            id="secret"
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            autoFocus
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || !secret}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Lost it? Run <code className="font-mono">npm run setup -- --rotate</code> and sign in with the new one.
        </p>
      </form>
    </main>
  );
}
