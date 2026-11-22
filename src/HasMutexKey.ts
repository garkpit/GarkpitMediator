/**
 * Requests implementing this declare the mutex key(s) their command must hold. A single string
 * locks one resource (e.g. `account:<id>`). An array locks several atomically: keys are acquired in
 * sorted order, which rules out the "A waits for B, B waits for A" deadlock. A command that mutates
 * two shared resources declares both keys here rather than chaining two sends.
 */
export interface HasMutexKey {
  mutexKey(): string | readonly string[];
}

export function isMutexed(req: unknown): req is HasMutexKey {
  return (
    typeof req === 'object' &&
    req !== null &&
    'mutexKey' in req &&
    typeof (req as { mutexKey: unknown }).mutexKey === 'function'
  );
}
