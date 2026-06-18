import type { Location } from '../data/locations';

const SV_TIMEOUT_MS = 10_000;

export function loadStreetView(loc: Location, round: number): void {
  const loader = document.getElementById('sv-loader')!;
  const fallback = document.getElementById('sv-fallback')!;
  const content = document.getElementById('sv-content')!;

  loader.classList.remove('gone');
  fallback.classList.remove('show');
  content.innerHTML = '';

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none';
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

  const heading = loc.head ?? 180;
  iframe.src = `https://maps.google.com/maps?layer=c&cbll=${loc.lat},${loc.lng}&cbp=12,${heading},0,0,0&output=svembed&hl=en`;

  let loaded = false;

  iframe.addEventListener('load', () => {
    loaded = true;
    setTimeout(() => loader.classList.add('gone'), 400);
  });

  iframe.addEventListener('error', () => {
    loader.classList.add('gone');
    showFallback(loc, round);
  });

  content.appendChild(iframe);

  setTimeout(() => {
    if (!loaded) {
      loader.classList.add('gone');
      showFallback(loc, round);
    }
  }, SV_TIMEOUT_MS);
}

function showFallback(loc: Location, round: number): void {
  document.getElementById('fb-rnd')!.textContent = String(round);
  document.getElementById('fb-hint')!.textContent = loc.h;
  const link = document.getElementById('fb-link') as HTMLAnchorElement;
  link.href = `https://maps.google.com/maps?q=&layer=c&cbll=${loc.lat},${loc.lng}&cbp=12,${loc.head ?? 180},0,0,0`;
  document.getElementById('sv-fallback')!.classList.add('show');
}
