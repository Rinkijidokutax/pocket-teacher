import { levelInfo } from "@/lib/levels";

// Compact level + XP + streak header used on Home and Progress.
export default function XpHeader({
  name,
  xp,
  streak,
}: {
  name: string;
  xp: number;
  streak: number;
}) {
  const lv = levelInfo(xp);
  return (
    <div className="card p-4 pop">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">Level {lv.level}</p>
          <p className="text-lg font-extrabold leading-tight">{lv.title}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black">
            <span className="flame">🔥</span> {streak}
          </p>
          <p className="text-[11px] text-slate-400 -mt-1">day streak</p>
        </div>
      </div>
      <div className="xpbar mt-3">
        <span style={{ width: `${lv.pct}%` }} />
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">
        {lv.into}/{lv.span} XP · {lv.toNext} to level {lv.level + 1}
      </p>
    </div>
  );
}
