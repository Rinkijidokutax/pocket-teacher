// A scheduled study task should LAUNCH its activity for its topic, not just be a checkbox.
export function taskHref(
  kind: string,
  courseId: string | null,
  topicId: string | null
): string {
  const t = topicId ? `&topic=${topicId}` : "";
  if (kind === "quiz") return `/quiz?course=${courseId}${t}`;
  if (kind === "flashcards") return `/flashcards?course=${courseId}${t}`;
  return `/session?course=${courseId}`;
}
