type TickFn = (remaining: number, max: number) => void;
type ExpireFn = () => void;

export class GameTimer {
  private remainingSec: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly maxSec: number,
    private readonly onTick: TickFn,
    private readonly onExpire: ExpireFn,
  ) {
    this.remainingSec = maxSec;
  }

  start(): void {
    this.stop();
    this.remainingSec = this.maxSec;
    this.tick();
    this.intervalId = setInterval(() => {
      this.remainingSec--;
      this.tick();
      if (this.remainingSec <= 0) {
        this.stop();
        this.onExpire();
      }
    }, 1000);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    this.onTick(this.remainingSec, this.maxSec);
  }
}
