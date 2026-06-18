import { showScreen } from './index';
import { getMpState, setMpPlayers } from '../multiplayer/mp-state';
import { leaveRoom } from '../multiplayer/rooms';
import { hostStartGame } from '../multiplayer/game-sync';
import { closeChannel } from '../multiplayer/channel';
import { resetMpState } from '../multiplayer/mp-state';
import type { Room, RoomPlayer } from '../multiplayer/types';

let countdownTimer: ReturnType<typeof setInterval> | null = null;
let countdownVal = 3;

export function initLobby(): void {
  document.getElementById('btn-lby-leave')!.addEventListener('click', onLeave);
  document.getElementById('btn-copy-link')!.addEventListener('click', onCopyLink);
}

export function showLobby(room: Room, players: RoomPlayer[]): void {
  // Room type badge
  document.getElementById('lby-room-type')!.textContent =
    `${room.type === 'private' ? 'PRIVATE' : 'PUBLIC'} · ${room.max_players} PLAYERS`;

  // Show room code for private rooms
  const codeWrap = document.getElementById('lby-code-wrap')!;
  if (room.type === 'private') {
    codeWrap.hidden = false;
    document.getElementById('lby-code')!.textContent = room.code;
  } else {
    codeWrap.hidden = true;
  }

  renderSlots(players, room.max_players);
  updateStatus(players, room.max_players);

  showScreen('lobby');

  // If room is already full when we join, start the countdown
  const active = players.filter((p) => p.status !== 'disconnected');
  if (active.length >= room.max_players && !countdownTimer) {
    startCountdown();
  }
}

export function updateLobbyPlayers(players: RoomPlayer[]): void {
  const mpState = getMpState();
  if (!mpState.room) return;

  setMpPlayers(players);
  renderSlots(players, mpState.room.max_players);
  updateStatus(players, mpState.room.max_players);

  const active = players.filter((p) => p.status !== 'disconnected');
  if (active.length >= mpState.room.max_players && !countdownTimer) {
    startCountdown();
  } else if (active.length < mpState.room.max_players && countdownTimer) {
    stopCountdown();
  }
}

// ─── Slot rendering ───────────────────────────────────────────────────────────

function renderSlots(players: RoomPlayer[], maxPlayers: number): void {
  const container = document.getElementById('lby-slots')!;
  const localId = getMpState().localPlayer?.player_id;
  const active = players.filter((p) => p.status !== 'disconnected');

  container.innerHTML = Array.from({ length: maxPlayers }, (_, i) => {
    const p = active[i];
    if (!p) return emptySlot();
    const isLocal = p.player_id === localId;
    return playerSlot(p, isLocal);
  }).join('');
}

function playerSlot(p: RoomPlayer, isLocal: boolean): string {
  const initials = p.name.slice(0, 2).toUpperCase();
  const c = safeColor(p.color);
  return `
    <div class="lby-slot filled" style="--pc:${c}">
      <div class="lby-avatar" style="background:${c}20;border-color:${c}">
        <span class="lby-avatar-txt">${initials}</span>
        <div class="lby-avatar-dot" style="background:${c}"></div>
      </div>
      <div class="lby-player-info">
        <div class="lby-player-name">${escHtml(p.name)}${isLocal ? ' <span class="lby-you">(you)</span>' : ''}</div>
        <div class="lby-player-status">Connected</div>
      </div>
      <div class="lby-status-dot connected"></div>
    </div>
  `;
}

function emptySlot(): string {
  return `
    <div class="lby-slot empty">
      <div class="lby-avatar empty">
        <div class="lby-avatar-skeleton"></div>
      </div>
      <div class="lby-player-info">
        <div class="lby-player-name-skel"></div>
        <div class="lby-player-status">Waiting for player...</div>
      </div>
      <div class="lby-status-dot waiting"></div>
    </div>
  `;
}

// ─── Status bar ───────────────────────────────────────────────────────────────

function updateStatus(players: RoomPlayer[], maxPlayers: number): void {
  const active = players.filter((p) => p.status !== 'disconnected').length;
  const msgEl = document.getElementById('lby-status-msg')!;
  const fillEl = document.getElementById('lby-progress-fill')!;

  const pct = (active / maxPlayers) * 100;
  fillEl.style.width = `${pct}%`;

  if (active >= maxPlayers) {
    msgEl.textContent = 'All players joined! Starting soon...';
    msgEl.style.color = 'var(--g)';
  } else {
    const need = maxPlayers - active;
    msgEl.textContent = `Waiting for ${need} more player${need !== 1 ? 's' : ''}...`;
    msgEl.style.color = '';
  }
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function startCountdown(): void {
  const cd = document.getElementById('lby-countdown')!;
  const num = document.getElementById('lby-countdown-num')!;
  countdownVal = 3;
  num.textContent = '3';
  cd.hidden = false;
  cd.classList.add('show');

  countdownTimer = setInterval(() => {
    countdownVal--;
    num.textContent = String(countdownVal);
    num.classList.remove('pop');
    void num.offsetWidth;
    num.classList.add('pop');

    if (countdownVal <= 0) {
      stopCountdown();
      hostStartGame();
    }
  }, 1000);
}

function stopCountdown(): void {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  const cd = document.getElementById('lby-countdown')!;
  cd.hidden = true;
  cd.classList.remove('show');
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function onLeave(): Promise<void> {
  const mpState = getMpState();
  if (mpState.room) {
    await leaveRoom(mpState.room.id);
  }
  stopCountdown();
  closeChannel();
  resetMpState();
  showScreen('splash');
}

function onCopyLink(): void {
  const mpState = getMpState();
  if (!mpState.room) return;

  const url = `${location.origin}${location.pathname}?room=${mpState.room.code}`;
  const btn = document.getElementById('btn-copy-link')!;
  const orig = btn.textContent;

  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }).catch(() => {
    // Clipboard API unavailable (HTTP, denied permission) — show URL for manual copy
    prompt('Copy invite link:', url);
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeColor(c: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#888888';
}
