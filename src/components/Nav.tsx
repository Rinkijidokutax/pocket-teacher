"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/home", label: "Home", icon: "🏠" },
  { href: "/session", label: "Learn", icon: "📖" },
  { href: "/progress", label: "Progress", icon: "📈" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-[#151228]/95 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around max-w-md mx-auto">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-col items-center py-2 px-6 text-xs ${
              path === t.href ? "text-violet-300" : "text-slate-400"
            }`}
          >
            <span className="text-xl">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
