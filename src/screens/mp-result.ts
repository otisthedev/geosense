import { showScreen } from './index';
import { getMpState, isHost, resetMpState } from '../multiplayer/mp-state';
import { escHtml as _esc, safeColor as _safeColor } from '../utils/html';
import { closeChannel } from '../multiplayer/channel';
import { initMpResultMap } from '../services/map';
import { launchConfetti } from '../ui/confetti';
import { hostForceAdvance } from '../multiplayer/game-sync';
import type { RoundResult } from '../multiplayer/types';
import { getState } from '../state';

const DISPLAY_SECONDS = 8;
let autoTimer: ReturnType<typeof setInterval> | null = null;
let currentRound = 0;

export function showMpResult(results: RoundResult[]): void {
  const gameState = getState();
  const mpState = getMpState();
  const loc = gameState.currentLocation!;
  currentRound = gameState.round;

  document.getElementById('mpr-round-lbl')!.textContent = `ROUND ${gameState.round} / ${gameState.totalRounds}`;
  document.getElementById('mpr-location')!.textContent = loc.name;

  const ranked = [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.time_ms ?? 999999) - (b.time_ms ?? 999999);
  });

  _renderLeaderboard(ranked, mpState.localPlayer?.player_id ?? '');

  // Host-only "Next" button for early advance
  const nextBtn = document.getElementById('btn-mpr-next')!;
  nextBtn.hidden = !isHost();

  showScreen('mp-result');

  setTimeout(() => {
    initMpResultMap('mpr-map', results, loc.lat, loc.lng, loc.name);
  }, 80);

  const localResult = results.find((r) => r.player_id === mpState.localPlayer?.player_id);
  if (localResult && localResult.score > 4200) launchConfetti();

  _startCountdown();
}

function _renderLeaderboard(ranked: RoundResult[], localId: string): void {
  const el = document.getElementById('mpr-leaderboard')!;
  el.innerHTML = ranked.map((r, i) => {
    const isLocal = r.player_id === localId;
    const distStr = r.no_guess || r.distance_km === null
      ? '—'
      : r.distance_km < 1 ? '< 1 km'
      : r.distance_km < 10 ? `${r.distance_km.toFixed(1)} km`
      : `${Math.round(r.distance_km).toLocaleString()} km`;
    const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    return `
      <div class="mpr-row${isLocal ? ' local' : ''}${i === 0 ? ' winner' : ''}">
        <div class="mpr-rank">${rankEmoji}</div>
        <div class="mpr-dot" style="background:${_safeColor(r.color)}"></div>
        <div class="mpr-name">${_esc(r.name)}${isLocal ? ' <span class="mpr-you">(you)</span>' : ''}</div>
        <div class="mpr-dist">${distStr}</div>
        <div class="mpr-pts${i === 0 ? ' hi' : ''}">${r.score.toLocaleString()}</div>
      </div>
    `;
  }).join('');
}

function _startCountdown(): void {
  _stopCountdown();
  let remaining = DISPLAY_SECONDS;
  const timerEl = document.getElementById('mpr-timer')!;

  const tick = (): void => {
    if (remaining <= 0) { _stopCountdown(); return; }
    timerEl.textContent = `Next round in ${remaining}s`;
    remaining--;
  };
  tick();
  autoTimer = setInterval(tick, 1000);
}

function _stopCountdown(): void {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  const timerEl = document.getElementById('mpr-timer');
  if (timerEl) timerEl.textContent = '';
}


export function initMpResult(): void {
  document.getElementById('btn-mpr-menu')!.addEventListener('click', () => {
    _stopCountdown();
    closeChannel();
    resetMpState();
    showScreen('splash');
  });

  document.getElementById('btn-mpr-next')!.addEventListener('click', () => {
    if (!isHost()) return;
    _stopCountdown();
    hostForceAdvance(currentRound);
  });
}
