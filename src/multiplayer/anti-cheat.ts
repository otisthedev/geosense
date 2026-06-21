// Behavioral metadata collected during each round and submitted with the guess.
// Signals are logged server-side (round_guesses.meta) for post-hoc analysis.
// No client-side banning — only flagging for review.

export interface BehaviorMeta {
  first_pin_ms:   number | null;   // ms from round start to first pin placement
  submit_ms:      number;          // ms from round start to submit button press
  pin_count:      number;          // how many times the pin was moved
  tab_hidden:     boolean;         // tab was backgrounded at any point (screenshot signal)
  devtools_hint:  boolean;         // heuristic: DevTools may be open at submit time
}

class BehaviorTracker {
  private roundStartMs = 0;
  private firstPinMs: number | null = null;
  private pinCount = 0;
  private tabHidden = false;

  private readonly visibilityHandler = (): void => {
    if (document.hidden) this.tabHidden = true;
  };

  start(roundStartMs: number): void {
    this.roundStartMs = roundStartMs;
    this.firstPinMs   = null;
    this.pinCount     = 0;
    this.tabHidden    = false;
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  stop(): void {
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }

  recordPin(): void {
    if (this.firstPinMs === null) {
      this.firstPinMs = Date.now() - this.roundStartMs;
    }
    this.pinCount++;
  }

  collect(submitMs: number): BehaviorMeta {
    return {
      first_pin_ms:  this.firstPinMs,
      submit_ms:     submitMs - this.roundStartMs,
      pin_count:     this.pinCount,
      tab_hidden:    this.tabHidden,
      devtools_hint: isDevToolsOpen(),
    };
  }
}

// Heuristic: Chrome/Edge DevTools typically consume 160+ px on one edge.
// Not reliable against all configurations, but catches most casual cases.
function isDevToolsOpen(): boolean {
  return (
    window.outerWidth  - window.innerWidth  > 160 ||
    window.outerHeight - window.innerHeight > 160
  );
}

export const behaviorTracker = new BehaviorTracker();
