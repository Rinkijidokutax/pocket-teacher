"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) setError(error.message);
      else if (data.session) await afterAuth();
      else setNotice("Check your email to confirm your account, then sign in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else await afterAuth();
    }
    setBusy(false);
  }

  async function afterAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", user!.id)
      .single();
    router.replace(profile?.onboarded ? "/home" : "/onboarding");
  }

  return (
    <main className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full min-h-screen gap-6">
      <h1 className="text-3xl font-bold text-center">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <input
            className="input"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {notice && <p className="text-emerald-400 text-sm">{notice}</p>}
        <button
          disabled={busy}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded-2xl py-4 mt-2"
        >
          {busy ? "..." : mode === "signup" ? "Sign up" : "Sign in"}
        </button>
      </form>
      <button
        className="text-slate-400 text-sm"
        onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
      >
        {mode === "signup"
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </button>
    </main>
  );
}
