"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignIn() {
  const { supabase } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success("Check your inbox for the sign-in link.");
  };

  return (
    <div className="app-canvas relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* soft accent glow, single restrained color */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full opacity-[0.18] blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--primary), transparent)",
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur-sm">
          <div className="mb-7 flex flex-col items-center text-center">
            <span className="brand-mark mb-4 h-9 w-9 text-base">R</span>
            <h1 className="text-xl font-semibold tracking-tight">ResearchOS</h1>
            <p className="text-muted-foreground mt-1.5 max-w-xs text-sm leading-relaxed">
              Drop in your files, then generate and refine documents with an
              agent that edits — not rewrites.
            </p>
          </div>

          {sent ? (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-center text-sm">
              <p className="font-medium">Link sent</p>
              <p className="text-muted-foreground mt-1">
                We emailed a magic link to <strong>{email}</strong>. Click it to
                sign in.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <label className="text-muted-foreground text-xs font-medium">
                Work email
              </label>
              <Input
                type="email"
                placeholder="you@lab.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
              <Button type="submit" disabled={busy} className="mt-1 h-11">
                {busy ? "Sending…" : "Continue with email"}
              </Button>
            </form>
          )}

          <p className="text-muted-foreground mt-6 text-center text-xs">
            By continuing you agree to use ResearchOS for awesome research.
          </p>
        </div>
      </div>
    </div>
  );
}
