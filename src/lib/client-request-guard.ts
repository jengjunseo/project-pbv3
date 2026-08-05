export class RequestEpoch {
  private value = 0;

  begin(): number {
    this.value += 1;
    return this.value;
  }

  invalidate(): void {
    this.value += 1;
  }

  isCurrent(epoch: number): boolean {
    return epoch === this.value;
  }
}
