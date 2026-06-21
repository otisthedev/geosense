export function initDivider(): void {
  const div = document.getElementById('v-div')!;
  const svp = document.getElementById('sv-panel')!;
  const ws = document.getElementById('workspace')!;
  let dragging = false;
  let startPos = 0;
  let startSize = 0;

  const isMobile = (): boolean => window.innerWidth <= 700;

  const onStart = (x: number, y: number): void => {
    dragging = true;
    startPos = isMobile() ? y : x;
    startSize = isMobile() ? svp.offsetHeight : svp.offsetWidth;
    div.classList.add('drag');
    document.body.style.cursor = isMobile() ? 'ns-resize' : 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const onMove = (x: number, y: number): void => {
    if (!dragging) return;
    const delta = (isMobile() ? y : x) - startPos;
    const wsSize = isMobile() ? ws.offsetHeight : ws.offsetWidth;
    const min = isMobile() ? 80 : 200;
    const max = wsSize - (isMobile() ? 80 : 200);
    const next = Math.max(min, Math.min(max, startSize + delta));
    if (isMobile()) {
      svp.style.height = `${next}px`;
      svp.style.width = '';
    } else {
      svp.style.width = `${next}px`;
      svp.style.height = '';
    }
    window.dispatchEvent(new CustomEvent('divider:resize'));
  };

  const onEnd = (): void => {
    if (!dragging) return;
    dragging = false;
    div.classList.remove('drag');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  div.addEventListener('mousedown', (e) => { onStart(e.clientX, e.clientY); e.preventDefault(); });
  div.addEventListener('touchstart', (e) => {
    onStart(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('mousemove', (e) => { onMove(e.clientX, e.clientY); });
  document.addEventListener('touchmove', (e) => {
    if (dragging) { onMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
  }, { passive: false });

  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);

  let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('resize', () => {
    svp.style.width = '';
    svp.style.height = '';
    if (resizeDebounce) clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('divider:resize'));
    }, 100);
  });
}
