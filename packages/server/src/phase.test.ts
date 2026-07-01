import { describe, it, expect } from 'vitest';
import { Phase } from '@argus/shared';
import { PhaseMachine } from './phase';

describe('PhaseMachine', () => {
  describe('initialization', () => {
    it('initializes to IDLE phase', () => {
      const machine = new PhaseMachine();
      expect(machine.getCurrentPhase()).toBe(Phase.IDLE);
    });
  });

  describe('advance', () => {
    it('allows IDLE → REGISTER', () => {
      const machine = new PhaseMachine();
      const result = machine.advance(Phase.REGISTER);
      expect(result).toEqual({ success: true });
      expect(machine.getCurrentPhase()).toBe(Phase.REGISTER);
    });

    it('allows REGISTER → MESH', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      const result = machine.advance(Phase.MESH);
      expect(result).toEqual({ success: true });
      expect(machine.getCurrentPhase()).toBe(Phase.MESH);
    });

    it('allows MESH → DEPLOY', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      const result = machine.advance(Phase.DEPLOY);
      expect(result).toEqual({ success: true });
      expect(machine.getCurrentPhase()).toBe(Phase.DEPLOY);
    });

    it('allows DEPLOY → STITCH', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      machine.advance(Phase.DEPLOY);
      const result = machine.advance(Phase.STITCH);
      expect(result).toEqual({ success: true });
      expect(machine.getCurrentPhase()).toBe(Phase.STITCH);
    });

    it('allows STITCH → IDLE (cycle wraps)', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      machine.advance(Phase.DEPLOY);
      machine.advance(Phase.STITCH);
      const result = machine.advance(Phase.IDLE);
      expect(result).toEqual({ success: true });
      expect(machine.getCurrentPhase()).toBe(Phase.IDLE);
    });

    it('rejects non-sequential transition IDLE → MESH', () => {
      const machine = new PhaseMachine();
      const result = machine.advance(Phase.MESH);
      expect(result).toEqual({
        success: false,
        error: 'Invalid transition from IDLE to MESH',
      });
      expect(machine.getCurrentPhase()).toBe(Phase.IDLE);
    });

    it('rejects non-sequential transition IDLE → DEPLOY', () => {
      const machine = new PhaseMachine();
      const result = machine.advance(Phase.DEPLOY);
      expect(result).toEqual({
        success: false,
        error: 'Invalid transition from IDLE to DEPLOY',
      });
      expect(machine.getCurrentPhase()).toBe(Phase.IDLE);
    });

    it('rejects non-sequential transition REGISTER → DEPLOY (skipping MESH)', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      const result = machine.advance(Phase.DEPLOY);
      expect(result).toEqual({
        success: false,
        error: 'Invalid transition from REGISTER to DEPLOY',
      });
      expect(machine.getCurrentPhase()).toBe(Phase.REGISTER);
    });

    it('rejects backward transition MESH → REGISTER', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      const result = machine.advance(Phase.REGISTER);
      expect(result).toEqual({
        success: false,
        error: 'Invalid transition from MESH to REGISTER',
      });
      expect(machine.getCurrentPhase()).toBe(Phase.MESH);
    });

    it('rejects transition to same phase', () => {
      const machine = new PhaseMachine();
      const result = machine.advance(Phase.IDLE);
      expect(result).toEqual({
        success: false,
        error: 'Invalid transition from IDLE to IDLE',
      });
    });
  });

  describe('reset (kill switch)', () => {
    it('resets from REGISTER to IDLE', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.reset();
      expect(machine.getCurrentPhase()).toBe(Phase.IDLE);
    });

    it('resets from MESH to IDLE', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      machine.reset();
      expect(machine.getCurrentPhase()).toBe(Phase.IDLE);
    });

    it('resets from DEPLOY to IDLE', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      machine.advance(Phase.DEPLOY);
      machine.reset();
      expect(machine.getCurrentPhase()).toBe(Phase.IDLE);
    });

    it('resets from STITCH to IDLE', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      machine.advance(Phase.DEPLOY);
      machine.advance(Phase.STITCH);
      machine.reset();
      expect(machine.getCurrentPhase()).toBe(Phase.IDLE);
    });

    it('is a no-op when already at IDLE', () => {
      const machine = new PhaseMachine();
      machine.reset();
      expect(machine.getCurrentPhase()).toBe(Phase.IDLE);
    });
  });

  describe('getValidTransitions', () => {
    it('returns [REGISTER] from IDLE', () => {
      const machine = new PhaseMachine();
      expect(machine.getValidTransitions()).toEqual([Phase.REGISTER]);
    });

    it('returns [MESH] from REGISTER', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      expect(machine.getValidTransitions()).toEqual([Phase.MESH]);
    });

    it('returns [DEPLOY] from MESH', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      expect(machine.getValidTransitions()).toEqual([Phase.DEPLOY]);
    });

    it('returns [STITCH] from DEPLOY', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      machine.advance(Phase.DEPLOY);
      expect(machine.getValidTransitions()).toEqual([Phase.STITCH]);
    });

    it('returns [IDLE] from STITCH', () => {
      const machine = new PhaseMachine();
      machine.advance(Phase.REGISTER);
      machine.advance(Phase.MESH);
      machine.advance(Phase.DEPLOY);
      machine.advance(Phase.STITCH);
      expect(machine.getValidTransitions()).toEqual([Phase.IDLE]);
    });
  });

  describe('full cycle', () => {
    it('completes a full cycle and starts another', () => {
      const machine = new PhaseMachine();

      // First cycle
      expect(machine.advance(Phase.REGISTER)).toEqual({ success: true });
      expect(machine.advance(Phase.MESH)).toEqual({ success: true });
      expect(machine.advance(Phase.DEPLOY)).toEqual({ success: true });
      expect(machine.advance(Phase.STITCH)).toEqual({ success: true });
      expect(machine.advance(Phase.IDLE)).toEqual({ success: true });

      // Second cycle
      expect(machine.advance(Phase.REGISTER)).toEqual({ success: true });
      expect(machine.getCurrentPhase()).toBe(Phase.REGISTER);
    });
  });
});
