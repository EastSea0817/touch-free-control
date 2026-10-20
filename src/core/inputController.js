// The one place that decides whether an input becomes an action.
// States:
//   ACTIVE     - clicks go through
//   PAUSED     - nothing fires except the pause toggle (to resume)
//   CONFIRMING - a high-risk click is waiting for a second, DIFFERENT signal
//
// Pure logic: events in, actions out. The UI does the actual clicking.

export const STATE = Object.freeze({ ACTIVE: 'ACTIVE', PAUSED: 'PAUSED', CONFIRMING: 'CONFIRMING' });

export function createInputController({ confirmTimeoutMs = 6000, initial = STATE.ACTIVE } = {}) {
  let state = initial;
  let pending = null; // {targetId, source, deadline}

  function setState(next, actions) {
    if (next !== state) {
      state = next;
      actions.push({ type: 'state', state });
    }
  }

  function cancel(reason, actions) {
    const p = pending;
    pending = null;
    actions.push({ type: 'confirmCancelled', reason, targetId: p?.targetId ?? null });
  }

  return {
    get state() {
      return state;
    },
    get pending() {
      return pending ? { ...pending } : null;
    },
    configure(opts) {
      if (opts.confirmTimeoutMs) confirmTimeoutMs = opts.confirmTimeoutMs;
    },
    /**
     * @param e {type, source?, risk?, targetId?, t}
     * @returns array of actions
     */
    handle(e) {
      const actions = [];
      switch (e.type) {
        case 'togglePause': {
          if (state === STATE.PAUSED) {
            setState(STATE.ACTIVE, actions);
            actions.push({ type: 'resumed', source: e.source });
          } else {
            if (state === STATE.CONFIRMING) cancel('paused', actions);
            setState(STATE.PAUSED, actions);
            actions.push({ type: 'paused', source: e.source });
          }
          break;
        }
        case 'click': {
          if (state === STATE.PAUSED) {
            actions.push({ type: 'blocked', reason: 'paused', source: e.source });
          } else if (state === STATE.CONFIRMING) {
            // While confirming, only the dialog's own buttons count
            // (they arrive as 'confirm' / 'cancel').
            actions.push({ type: 'blocked', reason: 'confirming', source: e.source });
          } else if (e.button === 'right') {
            // right click only opens a menu; it never runs a risky action
            actions.push({ type: 'click', targetId: e.targetId, source: e.source, button: 'right' });
          } else if (e.risk === 'high') {
            pending = { targetId: e.targetId, source: e.source, deadline: e.t + confirmTimeoutMs };
            setState(STATE.CONFIRMING, actions);
            actions.push({ type: 'confirmStart', ...pending });
          } else {
            actions.push({ type: 'click', targetId: e.targetId, source: e.source });
          }
          break;
        }
        case 'confirm': {
          if (state !== STATE.CONFIRMING || !pending) break;
          if (e.t > pending.deadline) {
            cancel('timeout', actions);
            setState(STATE.ACTIVE, actions);
          } else if (e.source === pending.source) {
            actions.push({ type: 'confirmRejected', reason: 'sameSource', needed: 'different', source: e.source });
          } else {
            const p = pending;
            pending = null;
            actions.push({ type: 'confirmed', targetId: p.targetId, source: e.source });
            actions.push({ type: 'click', targetId: p.targetId, source: e.source, confirmed: true });
            setState(STATE.ACTIVE, actions);
          }
          break;
        }
        case 'cancel': {
          if (state !== STATE.CONFIRMING) break;
          cancel('user', actions);
          setState(STATE.ACTIVE, actions);
          break;
        }
        case 'tick': {
          if (state === STATE.CONFIRMING && pending && e.t > pending.deadline) {
            cancel('timeout', actions);
            setState(STATE.ACTIVE, actions);
          }
          break;
        }
        default:
          break;
      }
      return actions;
    },
  };
}
