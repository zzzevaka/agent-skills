/** Pure helpers for the drag-and-drop stage list. */

export type AnnounceKind = "start" | "over" | "end" | "cancel";

/** Where a drop moves a stage, or null when nothing should change. */
export function resolveDrop(
  ids: string[],
  activeId: string,
  overId: string | null,
): { from: number; to: number } | null {
  if (overId === null || overId === activeId) return null;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return null;
  return { from, to };
}

/** Screen-reader text for each step of a drag; `position` is 1-based. */
export function announce(kind: AnnounceKind, name: string, position: number, total: number): string {
  switch (kind) {
    case "start":
      return `Picked up ${name}. Position ${position} of ${total}.`;
    case "over":
      return `${name} is over position ${position} of ${total}.`;
    case "end":
      return `Dropped ${name} at position ${position} of ${total}.`;
    case "cancel":
      return `Reordering cancelled. ${name} returned to position ${position} of ${total}.`;
  }
}

/** Stage names are unique in a valid flow; give duplicates in an invalid one distinct ids. */
export function uniqueIds(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count ? `${name}#${count}` : name;
  });
}
