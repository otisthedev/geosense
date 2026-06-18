import 'leaflet/dist/leaflet.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/screens.css';
import './styles/components.css';
import './styles/splash.css';
import './styles/game.css';
import './styles/result.css';
import './styles/final.css';
import './styles/leaflet-theme.css';
import './styles/confetti.css';
import './styles/mp-menu.css';
import './styles/lobby.css';
import './styles/mp-result.css';
import './styles/mp-final.css';
import './styles/mp-overlay.css';

import { initDivider } from './ui/divider';
import { initSplash, showSplash } from './screens/splash';
import { startGame, nextRound, initGameScreen, startMpRound, updateMpStatusBar } from './screens/game';
import { initMpMenu } from './screens/mp-menu';
import { initLobby, updateLobbyPlayers } from './screens/lobby';
import { showMpResult, initMpResult } from './screens/mp-result';
import { showMpFinal, initMpFinal } from './screens/mp-final';
import { onMpSync } from './multiplayer/mp-state';
import { resetGame } from './state';
import { IS_MP_ENABLED } from './multiplayer/client';

window.addEventListener('load', () => {
  initDivider();
  initSplash();
  initGameScreen();
  initMpResult();
  initMpFinal();
  initLobby();

  // ─── Single-player wiring ──────────────────────────────────────────────────
  document.getElementById('btn-start')!.addEventListener('click', startGame);
  document.getElementById('btn-nxt')!.addEventListener('click', nextRound);
  document.getElementById('btn-quit')!.addEventListener('click', showSplash);
  document.getElementById('btn-menu')!.addEventListener('click', showSplash);
  document.getElementById('btn-play-again')!.addEventListener('click', startGame);

  // ─── Multiplayer wiring ────────────────────────────────────────────────────
  if (IS_MP_ENABLED) {
    initMpMenu();

    onMpSync((event) => {
      switch (event.type) {
        case 'round:start':
          if (event.round === 1) resetGame();
          startMpRound(event.loc, event.startTime, event.duration, event.round);
          break;

        case 'round:end':
          showMpResult(event.results);
          break;

        case 'game:end':
          showMpFinal(event.finalScores);
          break;

        case 'players:update':
          updateLobbyPlayers(event.players);
          updateMpStatusBar();
          break;
      }
    });
  }
});
