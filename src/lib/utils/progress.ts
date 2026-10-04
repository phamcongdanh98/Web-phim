export const COMPLETED_THRESHOLD = 0.92;

export interface ProgressInput {
  positionSeconds: number;
  durationSeconds: number;
}

export interface ProgressComputed {
  position_seconds: number;
  duration_seconds: number;
  percentage: number;
  completed: boolean;
}

/** Normalises client-reported playback position into the values we persist. */
export function computeProgress({ positionSeconds, durationSeconds }: ProgressInput): ProgressComputed {
  const duration = Math.max(0, Math.floor(durationSeconds));
  const position = Math.min(Math.max(0, Math.floor(positionSeconds)), duration || Infinity);
  const ratio = duration > 0 ? position / duration : 0;
  return {
    position_seconds: position,
    duration_seconds: duration,
    percentage: Math.round(ratio * 10000) / 100,
    completed: ratio >= COMPLETED_THRESHOLD,
  };
}
