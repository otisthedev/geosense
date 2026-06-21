import type { Location } from '../data/locations';

const SV_TIMEOUT_MS = 10_000;

// Cleanup function for the previous round's canvas overlay
let _cleanupOverlay: (() => void) | null = null;

export function loadStreetView(loc: Location, round: number): void {
  const loader = document.getElementById('sv-loader')!;
  const fallback = document.getElementById('sv-fallback')!;
  const content = document.getElementById('sv-content')!;

  // Tear down previous overlay before clearing content
  if (_cleanupOverlay) { _cleanupOverlay(); _cleanupOverlay = null; }

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
    // Mount the anti-screenshot overlay once the panorama is visible
    _cleanupOverlay = _mountNoiseOverlay(content);
  });

  iframe.addEventListener('error', () => {
    loader.classList.add('gone');
    showFallback(loc, round);
  });

  // Block right-click "Save image as" on the entire Street View panel
  content.addEventListener('contextmenu', (e) => e.preventDefault(), { once: false });

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

// ─── Anti-screenshot canvas overlay ──────────────────────────────────────────
// Mounts a transparent canvas over the Street View iframe.
// The canvas is invisible to the human eye but is captured by:
//   • Browser/OS screenshot tools (Ctrl+PrtSc, DevTools capture)
//   • Phones or cameras pointed at the screen (the canvas is rendered on-screen)
//
// Two layers:
//   1. Sparse pixel noise — random low-alpha pixels that change every 2.5 s,
//      degrading the consistency required for AI vision model confidence.
//   2. Radial vignette — dark gradient at the edges that obscures text signs
//      and distinctive landmarks at the periphery of the panorama.
function _mountNoiseOverlay(parent: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  // z-index 3: above iframe (1) and fallback (5 is fallback, 6 is loader)
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
  parent.appendChild(canvas);

  // Per-session seed: each game session has a slightly different noise signature.
  // This prevents a pre-recorded noise pattern from being subtracted out.
  const seed = Math.random();

  let rafId: number;
  let lastDraw = 0;

  function redraw(ts: number): void {
    rafId = requestAnimationFrame(redraw);
    // Regenerate every 2.5 s — fast enough to catch screenshots taken at different moments
    if (ts - lastDraw < 2500) return;
    lastDraw = ts;

    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    canvas.width  = w;
    canvas.height = h;

    const ctx  = canvas.getContext('2d')!;
    const img  = ctx.createImageData(w, h);
    const data = img.data;

    // Sparse pixel noise: ~7% of pixels receive a low-alpha luminance offset.
    // Alpha 10–17 is below human perception thresholds (~4% on a dark/neutral background)
    // but is captured faithfully by camera sensors and screenshot APIs.
    for (let i = 0; i < data.length; i += 4) {
      if (Math.random() < 0.07) {
        const v   = Math.floor((Math.random() * 0.9 + seed * 0.1) * 35);
        data[i]     = v;          // R
        data[i + 1] = v;          // G
        data[i + 2] = v;          // B
        data[i + 3] = Math.floor(Math.random() * 8) + 10; // A: 10–17
      }
    }
    ctx.putImageData(img, 0, 0);

    // Vignette: darkens the outer ~25% of the frame.
    // Road signs, shop names, and distinctive landmarks most often appear at the
    // horizontal edges of a Street View panorama. The vignette reduces their
    // legibility in screenshots and photos without visually impairing gameplay.
    const cx  = w / 2;
    const cy  = h / 2;
    const innerR = Math.min(w, h) * 0.32;
    const outerR = Math.max(w, h) * 0.72;
    const vig = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    vig.addColorStop(0,   'rgba(0,0,0,0)');
    vig.addColorStop(0.6, 'rgba(0,0,0,0.06)');
    vig.addColorStop(1,   'rgba(0,0,0,0.22)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  rafId = requestAnimationFrame(redraw);

  return () => {
    cancelAnimationFrame(rafId);
    canvas.remove();
  };
}
