import { showScreen } from './index';
import { showResult } from './result';
import { showFinal } from './final';
import { getState, resetGame, beginRound, recordGuess, addScore, setRound } from '../state';
import { haversineKm, calcScore, scoreColorClass } from '../services/scoring';
import { GameTimer } from '../services/timer';
import { initGameMap, invalidateGameMap } from '../services/map';
import { loadStreetView } from '../services/streetView';
import { randomLandLocation } from '../services/randomLocation';
import type { RawLoc } from '../multiplayer/types';
import { getMpState } from '../multiplayer/mp-state';
import { handleMpGuessSubmit, handleTimerExpired, locationFromCoords } from '../multiplayer/game-sync';

let timer: GameTimer | null = null;

function updateTimerUI(remaining: number, max: number): void {
  const pct = (remaining / max) * 100;
  const bar = document.getElementById('tbar')!;
  bar.style.width = `${pct}%`;
  bar.classList.toggle('warn', remaining <= 20);
  const val = document.getElementById('tmr-val')!;
  val.textContent = String(remaining);
  val.style.color =
    remaining <= 20 ? 'var(--r)' : remaining <= 40 ? 'var(--o)' : 'var(--t)';
}

export function updateGuessPin(lat: number, lng: number): void {
  recordGuess(lat, lng);
  document.getElementById('btn-guess')!.classList.add('ready');
  document.getElementById('guess-lbl')!.textContent = `${lat.toFixed(1)}°, ${lng.toFixed(1)}°`;
  document.getElementById('guess-float')!.classList.add('pinned');
}

export function submitGuess(): void {
  timer?.stop();
  const state = getState();
  const noGuess = state.guessLat === null;
  const gl = noGuess ? state.currentLocation!.lat : state.guessLat!;
  const gn = noGuess ? state.currentLocation!.lng : state.guessLng!;
  const dist = noGuess ? 0 : haversineKm(gl, gn, state.currentLocation!.lat, state.currentLocation!.lng);
  const pts = noGuess ? 0 : calcScore(dist);

  if (getMpState().active) {
    // Disable the button to prevent double-submission while awaiting the DB write
    (document.getElementById('btn-guess') as HTMLButtonElement).disabled = true;
    showMpWaiting(pts, noGuess ? null : dist, noGuess);
    // Add score after DB confirms so local state matches server truth
    handleMpGuessSubmit(noGuess ? null : gl, noGuess ? null : gn, noGuess, pts)
      .then(() => addScore(pts))
      .catch(() => addScore(pts));
  } else {
    addScore(pts);
    showResult({ guessLat: gl, guessLng: gn, distKm: dist, points: pts, noGuess });
  }
}

export function startGame(): void {
  resetGame();
  nextRound();
}

export function nextRound(): void {
  const state = getState();
  if (state.round >= state.totalRounds) {
    showFinal();
    return;
  }

  beginRound(randomLandLocation());

  _renderGameScreen();

  timer = new GameTimer(getState().timerMax, updateTimerUI, submitGuess);
  timer.start();
}

// Called by game-sync when a multiplayer round:start event arrives
export function startMpRound(rawLoc: RawLoc, startTime: number, duration: number, round: number): void {
  timer?.stop();

  // Set state.round to round-1 so beginRound()'s ++ lands on the correct number
  setRound(round - 1);
  const loc = locationFromCoords(rawLoc.lat, rawLoc.lng, rawLoc.head);
  beginRound(loc);

  // Sync timer to server clock — account for any elapsed time since startTime
  const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const remaining = Math.max(15, duration - elapsed);

  _renderGameScreen();

  timer = new GameTimer(remaining, updateTimerUI, () => {
    submitGuess();
    handleTimerExpired();
  });
  timer.start();
}

function _renderGameScreen(): void {
  const s = getState();
  showScreen('game');

  document.getElementById('round-badge')!.textContent = `R${s.round}/${s.totalRounds}`;
  document.getElementById('score-val')!.textContent = s.score.toLocaleString();
  const guessBtn = document.getElementById('btn-guess') as HTMLButtonElement;
  guessBtn.className = 'btn-guess';
  guessBtn.disabled = false;
  document.getElementById('guess-lbl')!.textContent = 'Drop a pin to guess';
  document.getElementById('guess-float')!.classList.remove('pinned');
  document.getElementById('map-tip')!.classList.remove('hide');
  document.getElementById('sv-fallback')!.classList.remove('show');
  document.getElementById('sv-content')!.innerHTML = '';

  // Hide MP waiting overlay from previous round
  const mpWait = document.getElementById('mp-wait');
  if (mpWait) mpWait.hidden = true;

  // Show/hide MP status bar
  const mpBar = document.getElementById('mp-bar')!;
  mpBar.hidden = !getMpState().active;

  setTimeout(() => {
    initGameMap(
      'leaflet-map',
      updateGuessPin,
      () => document.getElementById('map-tip')?.classList.add('hide'),
    );
    invalidateGameMap();
  }, 60);

  loadStreetView(s.currentLocation!, s.round);
}

// Render the post-submission waiting overlay in MP mode
function showMpWaiting(pts: number, distKm: number | null, noGuess: boolean): void {
  const mpWait = document.getElementById('mp-wait')!;
  const scoreEl = document.getElementById('mp-wait-score')!;
  const distEl = document.getElementById('mp-wait-dist')!;

  scoreEl.textContent = pts.toLocaleString();
  scoreEl.className = `mp-wait-score ${scoreColorClass(pts, noGuess)}`;

  if (noGuess) {
    distEl.textContent = "Time's up — no pin placed";
  } else if (distKm !== null) {
    const d = distKm < 1 ? '< 1' : distKm < 10 ? distKm.toFixed(1) : Math.round(distKm).toLocaleString();
    distEl.textContent = `${d} km from target`;
  } else {
    distEl.textContent = '';
  }

  mpWait.hidden = false;
  updateMpWaitPlayers();
}

// Update the waiting overlay's player count display
export function updateMpStatusBar(): void {
  const mpState = getMpState();
  if (!mpState.active) return;

  // Status bar (top of game screen)
  const bar = document.getElementById('mp-bar-players')!;
  bar.innerHTML = mpState.players
    .filter((p) => p.status !== 'disconnected')
    .map((p) => {
      const guessed = p.status === 'guessed' || mpState.guessedIds.has(p.player_id);
      const cls = guessed ? 'guessed' : 'waiting';
      return `<div class="mp-player-pill ${cls}">
        <div class="mp-player-dot" style="background:${p.color}"></div>
        ${escHtml(p.name)}
      </div>`;
    }).join('');

  updateMpWaitPlayers();
}

function updateMpWaitPlayers(): void {
  const mpState = getMpState();
  const waitEl = document.getElementById('mp-wait-players');
  if (!waitEl) return;

  const active = mpState.players.filter((p) => p.status !== 'disconnected');
  const guessedCount = active.filter((p) => p.status === 'guessed' || mpState.guessedIds.has(p.player_id)).length;

  waitEl.innerHTML = active.map((p) => {
    const guessed = p.status === 'guessed' || mpState.guessedIds.has(p.player_id);
    return `<div class="mp-player-dot" style="background:${p.color};${guessed ? `box-shadow:0 0 6px ${p.color}` : 'opacity:.3'}"></div>`;
  }).join('') + `<span style="font-family:'DM Mono',monospace;font-size:.6rem;color:var(--td);margin-left:.4rem">${guessedCount}/${active.length} answered</span>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function initGameScreen(): void {
  document.getElementById('btn-guess')!.addEventListener('click', submitGuess);
  window.addEventListener('divider:resize', () => invalidateGameMap());
}
