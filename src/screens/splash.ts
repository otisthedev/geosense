import { showScreen } from './index';
import { getPersonalBest } from '../services/storage';
import { IS_MP_ENABLED } from '../multiplayer/client';

function syncPbDisplay(): void {
  const pb = getPersonalBest();
  const pbStat = document.getElementById('pb-stat')!;
  if (pb > 0) {
    document.getElementById('pb-val')!.textContent = pb.toLocaleString();
    pbStat.style.display = '';
  } else {
    pbStat.style.display = 'none';
  }
}

export function initSplash(): void {
  syncPbDisplay();
  const mpBtn = document.getElementById('btn-mp')!;
  if (IS_MP_ENABLED) mpBtn.hidden = false;
}

export function showSplash(): void {
  syncPbDisplay();
  showScreen('splash');
}
