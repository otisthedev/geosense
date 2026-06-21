export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Only accept valid CSS hex lengths: 3, 4, 6, or 8 digits (5 and 7 are invalid).
export function safeColor(c: string): string {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c) ? c : '#888888';
}
