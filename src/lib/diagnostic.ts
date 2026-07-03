// 10-question placement diagnostic. Each question maps to a syllabus unit;
// results seed initial mastery per topic in that unit.
// ponytail: static bank, one per key unit — adaptive item selection later.

export type DiagQuestion = {
  id: string;
  unit: string; // matches syllabus_topics.unit
  q: string;
  options: string[];
  answer: number; // index into options
};

export const DIAGNOSTIC: DiagQuestion[] = [
  {
    id: "d1",
    unit: "Number",
    q: "Write 0.00042 in standard form.",
    options: ["4.2 × 10⁻⁴", "4.2 × 10⁴", "42 × 10⁻⁵", "0.42 × 10⁻³"],
    answer: 0,
  },
  {
    id: "d2",
    unit: "Number",
    q: "A phone costs Rs 12 000. Its price increases by 15%. New price?",
    options: ["Rs 12 150", "Rs 13 800", "Rs 13 500", "Rs 14 000"],
    answer: 1,
  },
  {
    id: "d3",
    unit: "Algebra",
    q: "Solve: 3x − 7 = 11",
    options: ["x = 4", "x = 6", "x = 3", "x = 18"],
    answer: 1,
  },
  {
    id: "d4",
    unit: "Algebra",
    q: "Factorise: x² − 9",
    options: ["(x − 3)²", "(x + 3)²", "(x − 3)(x + 3)", "x(x − 9)"],
    answer: 2,
  },
  {
    id: "d5",
    unit: "Geometry",
    q: "The angles of a triangle are 2x, 3x and 4x. Find x.",
    options: ["20°", "30°", "40°", "60°"],
    answer: 0,
  },
  {
    id: "d6",
    unit: "Mensuration",
    q: "A circle has radius 7 cm. Its area is closest to: (π ≈ 22/7)",
    options: ["44 cm²", "154 cm²", "308 cm²", "49 cm²"],
    answer: 1,
  },
  {
    id: "d7",
    unit: "Trigonometry",
    q: "A right triangle has legs 6 cm and 8 cm. The hypotenuse is:",
    options: ["10 cm", "14 cm", "12 cm", "9 cm"],
    answer: 0,
  },
  {
    id: "d8",
    unit: "Coordinate geometry",
    q: "The gradient of the line through (1, 2) and (3, 8) is:",
    options: ["2", "3", "6", "1/3"],
    answer: 1,
  },
  {
    id: "d9",
    unit: "Statistics",
    q: "The mean of 4, 7, 9, and x is 7. Find x.",
    options: ["7", "8", "9", "6"],
    answer: 1,
  },
  {
    id: "d10",
    unit: "Probability",
    q: "A bag has 3 red and 5 blue marbles. P(red) = ?",
    options: ["3/5", "1/3", "3/8", "5/8"],
    answer: 2,
  },
];

// Units not covered by a question inherit the overall average.
export function seedScores(answers: Record<string, number>): {
  byUnit: Record<string, number>;
  overall: number;
} {
  const byUnit: Record<string, { right: number; total: number }> = {};
  for (const q of DIAGNOSTIC) {
    const u = (byUnit[q.unit] ??= { right: 0, total: 0 });
    u.total++;
    if (answers[q.id] === q.answer) u.right++;
  }
  const units: Record<string, number> = {};
  let sum = 0,
    n = 0;
  for (const [unit, r] of Object.entries(byUnit)) {
    // right answers seed 55–70, wrong seed 15–25: diagnostic is a prior, not proof
    const score = Math.round(20 + (r.right / r.total) * 45);
    units[unit] = score;
    sum += score;
    n++;
  }
  return { byUnit: units, overall: Math.round(sum / n) };
}
