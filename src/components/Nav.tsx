"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/home", label: "Home", icon: "🏠" },
  { href: "/session", label: "Learn", icon: "🎓" },
  { href: "/progress", label: "Progress", icon: "📊" },
  { href: "/library", label: "Library", icon: "📚" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-[#120f2e]/90 backdrop-blur-xl border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around max-w-md mx-auto">
        {tabs.map((t) => {
          const on = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="flex flex-col items-center gap-0.5 py-2.5 px-5 text-[11px] font-semibold"
            >
              <span
                className={`text-xl transition ${on ? "scale-110" : "opacity-55 grayscale"}`}
              >
                {t.icon}
              </span>
              <span className={on ? "text-fuchsia-300" : "text-slate-500"}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
