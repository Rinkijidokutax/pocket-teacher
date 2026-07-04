import { levelInfo } from "@/lib/levels";

// Refined level + XP + streak header (Editorial Study).
export default function XpHeader({ xp, streak }: { xp: number; streak: number }) {
  const lv = levelInfo(xp);
  return (
    <div className="card p-5 rise">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Level {lv.level}</p>
          <p className="display text-2xl font-semibold mt-1">{lv.title}</p>
        </div>
        <div className="flex items-center gap-1.5 chip">
          <span className="flame" style={{ color: "var(--streak)" }}>▲</span>
          <span className="text-[color:var(--ink)] font-bold">{streak}</span>
          <span className="text-[color:var(--ink-faint)]">day{streak === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div className="xpbar mt-4">
        <span style={{ width: `${lv.pct}%` }} />
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-[color:var(--ink-faint)]">
        <span>{lv.into}/{lv.span} XP</span>
        <span>{lv.toNext} XP to level {lv.level + 1}</span>
      </div>
    </div>
  );
}
