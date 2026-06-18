const PB_KEY = 'gs_pb';

export function getPersonalBest(): number {
  return parseInt(localStorage.getItem(PB_KEY) ?? '0', 10);
}

export function setPersonalBest(score: number): void {
  localStorage.setItem(PB_KEY, String(score));
}
