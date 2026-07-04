// XP + level system for the gamified layer.
// Cumulative XP to reach level L is 25*L*(L-1): L2=50, L3=150, L4=300, L5=500…
// ponytail: closed-form curve, tune constants if progression feels off.

const TITLES = [
  "Rookie",
  "Apprentice",
  "Scholar",
  "Sharp Mind",
  "Ace",
  "Prodigy",
  "Master",
  "Sage",
  "Legend",
  "Genius",
];

export function cumXp(level: number): number {
  return 25 * level * (level - 1);
}

export function levelInfo(xp: number) {
  let level = 1;
  while (cumXp(level + 1) <= xp) level++;
  const floor = cumXp(level);
  const next = cumXp(level + 1);
  const into = xp - floor;
  const span = next - floor;
  return {
    level,
    title: TITLES[Math.min(level - 1, TITLES.length - 1)],
    into,
    span,
    pct: Math.round((into / span) * 100),
    toNext: next - xp,
  };
}

// XP rewards
export const XP = {
  correct: 12, // student showed understanding
  attempt: 4, // any judged attempt
  session: 5, // starting a lesson
};
