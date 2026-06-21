import { showScreen } from './index';
import { showResult } from './result';
import { showFinal } from './final';
import { getState, resetGame, beginRound, recordGuess, addScore, setRound } from '../state';
import { haversineKm, calcScore, calcMpScore, scoreColorClass } from '../services/scoring';
import { GameTimer } from '../services/timer';
import { initGameMap, invalidateGameMap } from '../services/map';
import { loadStreetView } from '../services/streetView';
import { randomLandLocation } from '../services/randomLocation';
import type { RawLoc } from '../multiplayer/types';
import { getMpState } from '../multiplayer/mp-state';
import { handleMpGuessSubmit, handleTimerExpired, locationFromCoords } from '../multiplayer/game-sync';
import { behaviorTracker } from '../multiplayer/anti-cheat';
import { escHtml } from '../utils/html';

let timer: GameTimer | null = null;

// Pending confirmation timeout for manual guess submissions.
// Timer-triggered auto-submits bypass this via submitGuess(true).
let confirmTimer: ReturnType<typeof setTimeout> | null = null;

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
  // Record for behavioral metadata: first-pin timing and total pin-move count
  behaviorTracker.recordPin();
  recordGuess(lat, lng);
  document.getElementById('btn-guess')!.classList.add('ready');
  document.getElementById('guess-lbl')!.textContent = `${lat.toFixed(1)}°, ${lng.toFixed(1)}°`;
  document.getElementById('guess-float')!.classList.add('pinned');
}

// ─── Guess submission ─────────────────────────────────────────────────────────

// Manual clicks go through a 1-second confirmation window (anti-bot friction).
// Timer-triggered auto-submits call submitGuess(true) to bypass it immediately.
export function submitGuess(immediate = false): void {
  // If a confirmation is pending and something forces immediate submit (timer),
  // cancel the countdown and fire right away.
  if (confirmTimer) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
  }

  if (!immediate) {
    const state = getState();
    const btn = document.getElementById('btn-guess') as HTMLButtonElement;

    // No pin placed yet — treat as a no-guess immediate submit
    if (state.guessLat === null) {
      _executeSubmit();
      return;
    }

    if (btn.disabled) return; // already in flight

    btn.disabled = true;
    btn.textContent = 'Confirming…';

    confirmTimer = setTimeout(() => {
      confirmTimer = null;
      _executeSubmit();
    }, 1000);
    return;
  }

  _executeSubmit();
}

function _executeSubmit(): void {
  timer?.stop();
  behaviorTracker.stop();

  const state = getState();
  const mpState = getMpState();
  const noGuess = state.guessLat === null;
  const gl = noGuess ? state.currentLocation!.lat : state.guessLat!;
  const gn = noGuess ? state.currentLocation!.lng : state.guessLng!;
  const dist = noGuess ? 0 : haversineKm(gl, gn, state.currentLocation!.lat, state.currentLocation!.lng);

  let pts: number;
  if (noGuess) {
    pts = 0;
  } else if (mpState.active) {
    const elapsedMs = Date.now() - mpState.roundStartTime;
    pts = calcMpScore(dist, elapsedMs, 90_000);
  } else {
    pts = calcScore(dist);
  }

  if (mpState.active) {
    (document.getElementById('btn-guess') as HTMLButtonElement).disabled = true;
    showMpWaiting(pts, noGuess ? null : dist, noGuess);
    // Collect behavioral signals at submission time and pass to DB
    const meta = behaviorTracker.collect(Date.now());
    handleMpGuessSubmit(noGuess ? null : gl, noGuess ? null : gn, noGuess, meta)
      .then(() => addScore(pts))
      .catch(() => addScore(pts));
  } else {
    addScore(pts);
    showResult({ guessLat: gl, guessLng: gn, distKm: dist, points: pts, noGuess });
  }
}

// ─── Round lifecycle ──────────────────────────────────────────────────────────

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

  // Auto-submit immediately on timer expiry (no confirmation delay)
  timer = new GameTimer(getState().timerMax, updateTimerUI, () => submitGuess(true));
  timer.start();
}

// Called by game-sync when a multiplayer round:start event arrives
export function startMpRound(rawLoc: RawLoc, startTime: number, duration: number, round: number): void {
  timer?.stop();

  // Set state.round to round-1 so beginRound()'s ++ lands on the correct number
  setRound(round - 1);
  const loc = locationFromCoords(rawLoc.lat, rawLoc.lng, rawLoc.head);
  beginRound(loc);

  // Start behavioral tracking from the server's declared round start time
  behaviorTracker.start(startTime);

  // Sync timer to server clock — account for any elapsed time since startTime
  const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const remaining = Math.max(15, duration - elapsed);

  _renderGameScreen();

  // Auto-submit on timer expiry (no confirmation delay for forced submits)
  timer = new GameTimer(remaining, updateTimerUI, () => {
    submitGuess(true);
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
  guessBtn.textContent = 'Guess';
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

  // Soft DevTools detection: warn in console (no action taken, data logged with guess)
  if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) {
    console.warn('[AC] DevTools may be open — flagged in behavioral metadata');
  }

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

// ─── MP waiting overlay ───────────────────────────────────────────────────────

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

export function initGameScreen(): void {
  // Use a wrapper so the event handler doesn't pass the MouseEvent as `immediate`
  document.getElementById('btn-guess')!.addEventListener('click', () => submitGuess(false));
  window.addEventListener('divider:resize', () => invalidateGameMap());

  // Block common screenshot/print shortcuts while the game screen is active.
  // This doesn't stop OS-level PrtSc or a second device, but it adds friction
  // for casual clipboard-style screenshots sent to AI assistants.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!document.getElementById('game')?.classList.contains('active')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (
      e.key === 'PrintScreen' ||
      (ctrl && e.key === 'p') ||                           // Ctrl+P / Cmd+P (print)
      (ctrl && e.shiftKey && e.key.toLowerCase() === 's') // Ctrl+Shift+S (save as)
    ) {
      e.preventDefault();
    }
  });
}
