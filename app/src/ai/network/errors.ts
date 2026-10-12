/** The wall refused a dispatch. Callers reroute local or abort — never send. */
export class WallViolationError extends Error {
  constructor(message: string, public readonly hits: string[] = []) {
    super(message);
    this.name = 'WallViolationError';
  }
}
