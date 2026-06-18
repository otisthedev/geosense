import type { Location } from '../data/locations';

export interface GameState {
  round: number;
  readonly totalRounds: number;
  readonly timerMax: number;
  score: number;
  roundScores: number[];
  currentLocation: Location | null;
  guessLat: number | null;
  guessLng: number | null;
}

const state: GameState = {
  round: 0,
  totalRounds: 5,
  timerMax: 90,
  score: 0,
  roundScores: [],
  currentLocation: null,
  guessLat: null,
  guessLng: null,
};

export function getState(): Readonly<GameState> {
  return state;
}

export function resetGame(): void {
  state.round = 0;
  state.score = 0;
  state.roundScores = [];
}

export function beginRound(loc: Location): void {
  state.round++;
  state.currentLocation = loc;
  state.guessLat = null;
  state.guessLng = null;
}

export function recordGuess(lat: number, lng: number): void {
  state.guessLat = lat;
  state.guessLng = lng;
}

export function addScore(pts: number): void {
  state.score += pts;
  state.roundScores.push(pts);
}

export function setRound(n: number): void {
  state.round = n;
}
