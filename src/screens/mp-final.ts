import { showScreen } from './index';
import { getMpState, resetMpState } from '../multiplayer/mp-state';
import { escHtml, safeColor } from '../utils/html';
import { closeChannel } from '../multiplayer/channel';
import { launchConfetti } from '../ui/confetti';
import type { FinalScore } from '../multiplayer/types';

export function showMpFinal(scores: FinalScore[]): void {
  const localId = getMpState().localPlayer?.player_id ?? '';

  // Winner banner
  const winner = scores[0];
  const winnerEl = document.getElementById('mpf-winner')!;
  if (winner) {
    const isLocal = winner.player_id === localId;
    winnerEl.innerHTML = `
      <div class="mpf-win-dot" style="background:${safeColor(winner.color)}"></div>
      <div class="mpf-win-text">
        ${isLocal ? '🎉 You win!' : `${escHtml(winner.name)} wins!`}
      </div>
    `;
  }

  // Podium (top 3)
  renderPodium(scores.slice(0, 3), localId);

  // Full leaderboard
  renderLeaderboard(scores, localId);

  showScreen('mp-final');

  // Confetti only for the winner
  const localRank = scores.find((s) => s.player_id === localId)?.rank ?? 999;
  if (localRank === 1) launchConfetti();
}

function renderPodium(top3: FinalScore[], localId: string): void {
  const el = document.getElementById('mpf-podium')!;

  // For 2-player games skip the 3-column podium (would look broken with only 2 entries)
  if (top3.length < 3) {
    el.hidden = true;
    return;
  }
  el.hidden = false;

  // Order: 2nd, 1st, 3rd for visual height effect
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = { 1: '100%', 2: '72%', 3: '55%' };

  el.innerHTML = order.map((s) => {
    const isLocal = s.player_id === localId;
    const rankLabel = s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : '🥉';
    const h = heights[s.rank as keyof typeof heights] ?? '55%';
    const c = safeColor(s.color);
    return `
      <div class="mpf-podium-col rank-${s.rank}${isLocal ? ' local' : ''}">
        <div class="mpf-podium-name">${escHtml(s.name)}</div>
        <div class="mpf-podium-score">${s.total_score.toLocaleString()}</div>
        <div class="mpf-podium-bar" style="height:${h};background:${c}20;border-color:${c}">
          <div class="mpf-podium-rank" style="color:${c}">${rankLabel}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderLeaderboard(scores: FinalScore[], localId: string): void {
  const el = document.getElementById('mpf-leaderboard')!;
  el.innerHTML = scores.map((s, i) => {
    const isLocal = s.player_id === localId;
    const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const chips = (s.round_scores as number[]).map((pts, ri) => {
      const c = pts > 3500 ? 'hi' : pts > 1500 ? 'md' : 'lo';
      return `<span class="chip ${c}">R${ri + 1}: ${pts.toLocaleString()}</span>`;
    }).join('');

    return `
      <div class="mpf-row${isLocal ? ' local' : ''}${i === 0 ? ' winner' : ''}">
        <div class="mpf-row-rank">${rankEmoji}</div>
        <div class="mpf-row-dot" style="background:${safeColor(s.color)}"></div>
        <div class="mpf-row-info">
          <div class="mpf-row-name">${escHtml(s.name)}${isLocal ? ' <span class="mpf-you">(you)</span>' : ''}</div>
          <div class="mpf-row-chips">${chips}</div>
        </div>
        <div class="mpf-row-total">${s.total_score.toLocaleString()}</div>
      </div>
    `;
  }).join('');
}

export function initMpFinal(): void {
  document.getElementById('btn-mpf-menu')!.addEventListener('click', () => {
    closeChannel();
    resetMpState();
    showScreen('splash');
  });

  document.getElementById('btn-mpf-again')!.addEventListener('click', () => {
    closeChannel();
    resetMpState();
    showScreen('mp-menu');
  });
}

