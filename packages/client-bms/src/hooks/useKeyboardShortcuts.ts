import { useEffect, useCallback } from 'react';
import { Phase } from '@argus/shared';

export interface UseKeyboardShortcutsOptions {
  serverUrl: string;
  operatorKey: string;
  validTransitions: Phase[];
  onToggleConsole: () => void;
  onPhaseChange?: (newPhase: Phase) => void;
}

/**
 * React hook that handles keyboard shortcuts for operator controls.
 *
 * Shortcuts:
 * - Space → advance to next valid phase
 * - Escape → kill switch (IDLE + disconnect all)
 * - Tab → focus node table
 * - 'O' → toggle operator console panel
 *
 * All control API calls include the `X-Operator-Key` header.
 *
 * @see Requirements 9.5, 9.6
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
  const { serverUrl, operatorKey, validTransitions, onToggleConsole, onPhaseChange } = options;

  const advancePhase = useCallback(async () => {
    if (validTransitions.length === 0) return;

    const nextPhase = validTransitions[0];
    try {
      const res = await fetch(`${serverUrl}/api/operator/phase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Key': operatorKey,
        },
        body: JSON.stringify({ phase: nextPhase }),
      });

      if (res.ok) {
        const data = await res.json();
        onPhaseChange?.(data.phase as Phase);
      }
    } catch {
      // Network error — silently ignore for keyboard shortcut
    }
  }, [serverUrl, operatorKey, validTransitions, onPhaseChange]);

  const activateKillSwitch = useCallback(async () => {
    try {
      const res = await fetch(`${serverUrl}/api/operator/phase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Key': operatorKey,
        },
        body: JSON.stringify({ phase: Phase.IDLE, force: true }),
      });

      if (res.ok) {
        onPhaseChange?.(Phase.IDLE);
      }
    } catch {
      // Network error — silently ignore for keyboard shortcut
    }
  }, [serverUrl, operatorKey, onPhaseChange]);

  const focusNodeTable = useCallback(() => {
    const nodeTable = document.getElementById('operator-node-table');
    if (nodeTable) {
      nodeTable.focus();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          advancePhase();
          break;

        case 'Escape':
          event.preventDefault();
          activateKillSwitch();
          break;

        case 'Tab':
          event.preventDefault();
          focusNodeTable();
          break;

        case 'o':
        case 'O':
          event.preventDefault();
          onToggleConsole();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [advancePhase, activateKillSwitch, focusNodeTable, onToggleConsole]);
}
