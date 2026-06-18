import { showScreen } from './index';
import { getState } from '../state';
import { getPersonalBest, setPersonalBest } from '../services/storage';
import { launchConfetti } from '../ui/confetti';

export function showFinal(): void {
  const state = getState();
  const pb = getPersonalBest();
  const isNewPB = state.score > pb;
  if (isNewPB) setPersonalBest(state.score);

  document.getElementById('fin-score')!.textContent = state.score.toLocaleString();

  const pbEl = document.getElementById('fin-pb')!;
  if (isNewPB && pb > 0) {
    pbEl.textContent = `↑ New personal best! (was ${pb.toLocaleString()})`;
    pbEl.style.color = 'var(--g)';
  } else if (isNewPB) {
    pbEl.textContent = 'First game complete — personal best set!';
    pbEl.style.color = 'var(--g)';
  } else {
    const diff = pb - state.score;
    pbEl.textContent = `Best: ${pb.toLocaleString()} — ${diff.toLocaleString()} pts away`;
    pbEl.style.color = '';
  }

  const pct = state.score / 25000;
  document.getElementById('fin-grade')!.textContent =
    pct > 0.9 ? '🏆 Geographic genius!' :
    pct > 0.7 ? '🌍 World explorer' :
    pct > 0.5 ? '📍 Getting there' :
    '🧭 Keep traveling!';

  document.getElementById('fin-chips')!.innerHTML = state.roundScores
    .map((s, i) => {
      const c = s > 3500 ? 'hi' : s > 1500 ? 'md' : 'lo';
      return `<div class="chip ${c}">R${i + 1}: ${s.toLocaleString()}</div>`;
    })
    .join('');

  showScreen('final');
  if (state.score > 12000) launchConfetti();
}
