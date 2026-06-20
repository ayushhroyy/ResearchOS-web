"use client";
// Magic-link sign in. Supabase sends an email; the link lands back here.
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
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Rabbitt</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Agentic document editing from your knowledge cluster.
        </p>
      </div>
      {sent ? (
        <p className="text-muted-foreground text-center text-sm">
          We sent a magic link to <strong>{email}</strong>. Click it to sign in.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send magic link"}
          </Button>
        </form>
      )}
    </div>
  );
}
