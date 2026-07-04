// The Mauritius education ladder — used in onboarding and course browsing.
export const LADDER: { id: string; label: string; hint: string; emoji: string }[] = [
  { id: "primary", label: "Primary (Grade 4–6)", hint: "PSAC", emoji: "🎒" },
  { id: "nce", label: "Lower Secondary (Grade 7–9)", hint: "NCE", emoji: "✏️" },
  { id: "o_level", label: "O-Level / SC (Grade 10–11)", hint: "Cambridge SC", emoji: "📗" },
  { id: "hsc", label: "A-Level / HSC (Grade 12–13)", hint: "Cambridge HSC", emoji: "🎓" },
  { id: "university", label: "University", hint: "Degree / diploma", emoji: "🏛️" },
  { id: "self", label: "Self-learner", hint: "Any course, your pace", emoji: "🚀" },
];

export const levelLabel = (id: string) =>
  LADDER.find((l) => l.id === id)?.label ?? id;
