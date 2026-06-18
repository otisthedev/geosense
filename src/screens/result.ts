import { showScreen } from './index';
import { getState } from '../state';
import { scoreColorClass, verdictText } from '../services/scoring';
import { initResultMap } from '../services/map';
import { launchConfetti } from '../ui/confetti';

export interface ResultData {
  guessLat: number;
  guessLng: number;
  distKm: number;
  points: number;
  noGuess: boolean;
}

export function showResult(data: ResultData): void {
  const { guessLat, guessLng, distKm, points, noGuess } = data;
  const state = getState();
  const loc = state.currentLocation!;

  document.getElementById('res-round-lbl')!.textContent = `ROUND ${state.round} / ${state.totalRounds}`;
  document.getElementById('res-verdict')!.textContent = verdictText(points, noGuess);

  const distStr = noGuess
    ? '—'
    : distKm < 1
      ? '< 1'
      : distKm < 10
        ? distKm.toFixed(1)
        : Math.round(distKm).toLocaleString();
  document.getElementById('res-dist-num')!.textContent = distStr;
  document.getElementById('res-loc')!.textContent = loc.name;
  document.getElementById('res-pts-stat')!.textContent = `${points.toLocaleString()} pts`;
  document.getElementById('res-total')!.textContent = `${state.score.toLocaleString()} pts`;

  const nxtBtn = document.getElementById('btn-nxt')!;
  nxtBtn.textContent =
    state.round >= state.totalRounds ? 'See Final Score →' : `Round ${state.round + 1} →`;

  showScreen('result');

  countUp(document.getElementById('res-pts')!, points, scoreColorClass(points, noGuess), 1200);

  setTimeout(() => {
    initResultMap('res-map', guessLat, guessLng, loc.lat, loc.lng, noGuess, loc.name);
  }, 100);

  if (points > 4200) launchConfetti();
}

function countUp(el: HTMLElement, target: number, colorClass: string, duration: number): void {
  const start = performance.now();
  const verdict = el.nextElementSibling as HTMLElement | null;
  el.className = 'res-pts';
  if (verdict) verdict.style.opacity = '0';

  const step = (now: number): void => {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - (1 - t) ** 3;
    el.textContent = Math.round(ease * target).toLocaleString();
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = target.toLocaleString();
      el.className = `res-pts ${colorClass}`;
      if (verdict) {
        verdict.style.transition = 'opacity .35s';
        verdict.style.opacity = '1';
      }
    }
  };
  requestAnimationFrame(step);
}
