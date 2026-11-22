export class MutexHeldError extends Error {
  constructor(public readonly key: string) {
    super(`Mutex held for key: ${key}`);
    this.name = 'MutexHeldError';
  }
}
