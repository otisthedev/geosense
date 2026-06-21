const COLORS = ['#00e5a0', '#7c6aff', '#ff6b35', '#ffffff', '#ffe066', '#ff3d5a'];

let spawnHandles: ReturnType<typeof setTimeout>[] = [];

export function launchConfetti(): void {
  clearConfetti();
  for (let i = 0; i < 80; i++) {
    spawnHandles.push(setTimeout(() => spawnParticle(), i * 28));
  }
}

export function clearConfetti(): void {
  spawnHandles.forEach(clearTimeout);
  spawnHandles = [];
  document.querySelectorAll('.cf').forEach((el) => el.remove());
}

function spawnParticle(): void {
  const el = document.createElement('div');
  el.className = 'cf';
  el.style.cssText = [
    `left:${Math.random() * 100}vw`,
    'top:-10px',
    `background:${COLORS[Math.floor(Math.random() * COLORS.length)]}`,
    `border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`,
    `transform:scale(${0.4 + Math.random()})`,
    `animation-duration:${2 + Math.random() * 3}s`,
  ].join(';');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5500);
}
