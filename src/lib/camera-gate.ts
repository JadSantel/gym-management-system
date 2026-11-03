export type CameraGate = { code: string | null; missingSince: number | null };
// Require a sustained blank read before accepting the same visible code again.
export function acceptCameraRead(state: CameraGate, code: string | null, now: number) {
  if (code === null) {
    state.missingSince ??= now;
    if (now - state.missingSince >= 500) state.code = null;
    return false;
  }
  state.missingSince = null;
  if (state.code === code) return false;
  state.code = code; return true;
}
