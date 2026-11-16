/** Owns exercise phase and accepted identities. Pure logic; no scene or UI access. */
export type BoltBackPhase = "Study" | "Practice" | "Complete";
export class BoltBackState {
  phase: BoltBackPhase = "Study";
  private seated = new Set<number>();
  get count(): number { return this.seated.size; }
  has(i: number): boolean { return this.seated.has(i); }
  reset(): void { this.phase = "Study"; this.seated.clear(); }
  practice(): void { if (this.phase === "Study") { this.phase = "Practice"; this.seated.clear(); } }
  accept(i: number, distance: number): boolean {
    if (this.phase !== "Practice" || !Number.isInteger(i) || i < 0 || i >= 3 ||
        this.seated.has(i) || !Number.isFinite(distance) || distance > 4) return false;
    this.seated.add(i);
    if (this.seated.size === 3) this.phase = "Complete";
    return true;
  }
}