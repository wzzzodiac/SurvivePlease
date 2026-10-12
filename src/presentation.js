// A death belongs to one resolution; old casualties never reappear.
export function actorVisible(p, state) {
  if (p.s === undefined) return false;
  if (p.alive) return true;
  return (
    ["reveal", "results"].includes(state?.phase) &&
    state.eliminated.some((e) => e.id === p.id)
  );
}
