import { showScreen } from './index';
import { IS_MP_ENABLED } from '../multiplayer/client';
import {
  getPlayerName, savePlayerName,
  findAndJoinPublicRoom, joinRoomByCode, createRoom,
} from '../multiplayer/rooms';
import { openChannel } from '../multiplayer/channel';
import {
  setMpActive, setMpRoom, setMpLocalPlayer, setMpPlayers,
} from '../multiplayer/mp-state';
import { handleBroadcastEvent, handlePlayersUpdate } from '../multiplayer/game-sync';
import { showLobby } from './lobby';

let selectedSize: 2 | 4 = 2;

export function initMpMenu(): void {
  if (!IS_MP_ENABLED) return;

  document.getElementById('btn-mp')!.addEventListener('click', showMpMenu);
  document.getElementById('btn-mpm-back')!.addEventListener('click', () => showScreen('splash'));

  const nameInput = document.getElementById('mpm-name') as HTMLInputElement;
  nameInput.value = getPlayerName();
  nameInput.addEventListener('input', () => savePlayerName(nameInput.value));

  // Size selector
  document.querySelectorAll<HTMLButtonElement>('.mpm-size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSize = (Number(btn.dataset.size) as 2 | 4);
      document.querySelectorAll('.mpm-size-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('btn-quickmatch')!.addEventListener('click', onQuickMatch);
  document.getElementById('btn-create-private')!.addEventListener('click', onCreatePrivate);
  document.getElementById('btn-join-code')!.addEventListener('click', () => onJoinCode());
  document.getElementById('mpm-code')!.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') onJoinCode();
  });

  // Handle ?room=CODE URL parameter (load event has already fired by this point)
  const urlCode = new URLSearchParams(location.search).get('room');
  if (urlCode) {
    setTimeout(() => autoJoinFromUrl(urlCode), 150);
  }
}

export function showMpMenu(): void {
  clearError();
  showScreen('mp-menu');
}

async function autoJoinFromUrl(code: string): Promise<void> {
  showMpMenu();
  (document.getElementById('mpm-code') as HTMLInputElement).value = code;
  await onJoinCode(code);
}

async function onQuickMatch(): Promise<void> {
  const name = (document.getElementById('mpm-name') as HTMLInputElement).value.trim();
  savePlayerName(name);
  setLoading(true);
  clearError();

  const result = await findAndJoinPublicRoom(selectedSize, name);
  setLoading(false);

  if ('error' in result) { showError(result.error); return; }
  _enterRoom(result.room, result.player, result.players);
}

async function onCreatePrivate(): Promise<void> {
  const name = (document.getElementById('mpm-name') as HTMLInputElement).value.trim();
  savePlayerName(name);
  setLoading(true);
  clearError();

  const result = await createRoom('private', selectedSize, name);
  setLoading(false);

  if ('error' in result) { showError(result.error); return; }
  _enterRoom(result.room, result.player, [result.player]);
}

async function onJoinCode(prefill?: string): Promise<void> {
  const name = (document.getElementById('mpm-name') as HTMLInputElement).value.trim();
  const code = prefill ?? (document.getElementById('mpm-code') as HTMLInputElement).value.trim();
  if (!code) { showError('Enter a room code'); return; }
  savePlayerName(name);
  setLoading(true);
  clearError();

  const result = await joinRoomByCode(code, name);
  setLoading(false);

  if ('error' in result) { showError(result.error); return; }
  _enterRoom(result.room, result.player, result.players);
}

async function _enterRoom(
  room: Parameters<typeof setMpRoom>[0],
  player: Parameters<typeof setMpLocalPlayer>[0],
  players: Parameters<typeof setMpPlayers>[0],
): Promise<void> {
  setMpActive(true);
  setMpRoom(room);
  setMpLocalPlayer(player);
  setMpPlayers(players);

  try {
    await openChannel(
      room.id,
      handleBroadcastEvent,
      (updated) => handlePlayersUpdate(updated),
    );
  } catch {
    showError('Could not connect to room. Check your connection and try again.');
    setMpActive(false);
    return;
  }

  showLobby(room, players);
}

function setLoading(on: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('.mpm-card, #btn-join-code').forEach((b) => {
    b.disabled = on;
    b.classList.toggle('loading', on);
  });
}

function showError(msg: string): void {
  const el = document.getElementById('mpm-error')!;
  el.textContent = msg;
  el.classList.add('show');
}

function clearError(): void {
  const el = document.getElementById('mpm-error')!;
  el.textContent = '';
  el.classList.remove('show');
}
