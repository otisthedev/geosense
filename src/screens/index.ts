export type ScreenId = 'splash' | 'game' | 'result' | 'final' | 'mp-menu' | 'lobby' | 'mp-result' | 'mp-final';

export function showScreen(id: ScreenId): void {
  document.querySelectorAll<HTMLElement>('.screen').forEach((s) => {
    s.classList.remove('active', 'visible');
  });
  const next = document.getElementById(id)!;
  next.classList.add('active');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => next.classList.add('visible'));
  });
}
