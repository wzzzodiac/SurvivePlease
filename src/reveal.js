export const SHOT_START = 0.65;
export const SHOT_TRAVEL = 0.18;
export const SHOT_IMPACT = SHOT_START + SHOT_TRAVEL;

export function shotProgress(state) {
  if (["results", "finished"].includes(state?.phase)) return 1;
  if (state?.phase !== "reveal") return 0;
  return Math.max(0, Math.min(1, (state.clock - SHOT_START) / SHOT_TRAVEL));
}
