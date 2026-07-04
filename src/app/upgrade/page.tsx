"use client";
import { useRouter } from "next/navigation";

const PERKS = [
  ["♾️", "Unlimited lessons", "No daily limit — study as much as you want"],
  ["📚", "All your subjects", "Every subject, every level, one price"],
  ["📸", "Upload anything", "Notes, past papers, photos, whole syllabi"],
  ["🎯", "Exam-prep mode", "Focused revision as your exam approaches"],
];

const WHATSAPP = process.env.NEXT_PUBLIC_UPGRADE_WHATSAPP || "";
const contactHref = WHATSAPP
  ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hi! I'd like to upgrade my Pocket Teacher to Premium.")}`
  : "mailto:dorasawmymiguel@gmail.com?subject=Pocket%20Teacher%20Premium&body=Hi!%20I'd%20like%20to%20upgrade%20to%20Premium.";

export default function Upgrade() {
  const router = useRouter();
  return (
    <main className="flex-1 flex flex-col px-7 max-w-md mx-auto w-full min-h-screen py-12 gap-6">
      <button onClick={() => router.back()} className="text-[color:var(--ink-soft)] text-sm self-start">
        ‹ Back
      </button>

      <div className="rise">
        <p className="eyebrow">Pocket Teacher</p>
        <h1 className="display text-5xl font-semibold mt-2">
          Go
          <br />
          <span className="italic" style={{ color: "var(--accent)" }}>Premium</span>
        </h1>
      </div>

      <div className="card p-5 rise d1">
        <div className="flex items-baseline gap-2">
          <span className="display text-4xl font-semibold">Rs 200</span>
          <span className="text-[color:var(--ink-soft)] text-sm">/ month</span>
        </div>
        <p className="text-xs text-[color:var(--ink-faint)] mt-1">Cancel anytime · one price, all subjects</p>
      </div>

      <div className="flex flex-col gap-2.5 rise d2">
        {PERKS.map(([icon, t, s]) => (
          <div key={t} className="flex items-center gap-3 py-2 border-b border-[color:var(--line)]">
            <span className="text-xl w-7 text-center">{icon}</span>
            <div>
              <p className="font-semibold text-sm">{t}</p>
              <p className="text-xs text-[color:var(--ink-faint)]">{s}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-6 rise d3">
        <a href={contactHref} target="_blank" rel="noopener noreferrer" className="btn-accent w-full inline-flex">
          Upgrade now →
        </a>
        <p className="text-center text-xs text-[color:var(--ink-faint)] mt-3">
          You&apos;ll be sent simple payment steps. Free plan stays free forever.
        </p>
      </div>
    </main>
  );
}
