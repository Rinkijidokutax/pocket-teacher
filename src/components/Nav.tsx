"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/home", label: "Home", icon: "◇" },
  { href: "/session", label: "Learn", icon: "✎" },
  { href: "/progress", label: "Progress", icon: "▚" },
  { href: "/library", label: "Library", icon: "❑" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-[color:var(--paper)]/85 backdrop-blur-xl border-t border-[color:var(--line)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around max-w-md mx-auto">
        {tabs.map((t) => {
          const on = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="flex flex-col items-center gap-1 py-2.5 px-6 text-[11px] font-semibold"
            >
              <span
                className={`text-lg leading-none transition ${
                  on ? "" : "text-[color:var(--ink-faint)]"
                }`}
                style={on ? { color: "var(--accent)" } : undefined}
              >
                {t.icon}
              </span>
              <span className={on ? "text-[color:var(--ink)]" : "text-[color:var(--ink-faint)]"}>
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
