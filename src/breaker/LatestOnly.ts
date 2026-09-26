/** Tags requests; only the reply to the most recent request is accepted (stale worker results are dropped). */
export class LatestOnly {
  private latest = 0;

  next(): number {
    this.latest += 1;
    return this.latest;
  }

  accept(id: number): boolean {
    return id === this.latest;
  }
}
