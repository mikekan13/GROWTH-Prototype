// FLUX.2 reads hex codes directly in prompts, so no name-lookup needed —
// just normalize the hex format (uppercase, leading #).

export function normalizeHex(hex: string | undefined): string {
  if (!hex) return '';
  const m = hex.replace(/^#/, '').match(/^([0-9a-fA-F]{6})$/);
  if (!m) return '';
  return `#${m[1].toUpperCase()}`;
}
