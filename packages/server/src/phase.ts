import { Phase } from '@argus/shared';

/**
 * Sequential phase ordering for the ARGUS demo lifecycle.
 * The cycle wraps: STITCH → IDLE.
 */
const PHASE_SEQUENCE: Phase[] = [
  Phase.IDLE,
  Phase.REGISTER,
  Phase.MESH,
  Phase.DEPLOY,
  Phase.STITCH,
];

/**
 * Phase State Machine controlling the ARGUS demo lifecycle.
 *
 * Enforces sequential transitions: IDLE→REGISTER→MESH→DEPLOY→STITCH→IDLE.
 * Provides a kill switch that bypasses validation to reset to IDLE from any phase.
 */
export class PhaseMachine {
  private currentPhase: Phase = Phase.IDLE;

  /** Returns the current phase of the state machine. */
  getCurrentPhase(): Phase {
    return this.currentPhase;
  }

  /**
   * Attempts to advance the phase state machine to the requested phase.
   * Only sequential transitions following the defined order are valid.
   * STITCH wraps back to IDLE.
   *
   * @returns `{ success: true }` if the transition is valid,
   *          `{ success: false, error: string }` otherwise.
   */
  advance(requestedPhase: Phase): { success: boolean; error?: string } {
    const currentIndex = PHASE_SEQUENCE.indexOf(this.currentPhase);
    const nextIndex = (currentIndex + 1) % PHASE_SEQUENCE.length;
    const expectedNext = PHASE_SEQUENCE[nextIndex];

    if (requestedPhase !== expectedNext) {
      return {
        success: false,
        error: `Invalid transition from ${this.currentPhase} to ${requestedPhase}`,
      };
    }

    this.currentPhase = requestedPhase;
    return { success: true };
  }

  /**
   * Kill switch: immediately resets phase to IDLE regardless of current phase.
   * Bypasses all transition validation.
   */
  reset(): void {
    this.currentPhase = Phase.IDLE;
  }

  /**
   * Returns the valid next phase(s) from the current phase.
   * Since only sequential transitions are allowed, this always returns
   * an array with the single valid next phase.
   */
  getValidTransitions(): Phase[] {
    const currentIndex = PHASE_SEQUENCE.indexOf(this.currentPhase);
    const nextIndex = (currentIndex + 1) % PHASE_SEQUENCE.length;
    return [PHASE_SEQUENCE[nextIndex]];
  }
}
