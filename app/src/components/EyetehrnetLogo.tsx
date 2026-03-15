/**
 * EŶ∃tehrNET logo — matches Core Rulebook v0.4.5, page 5.
 *
 * E     — Consolas, black text, red bg
 * Ŷ     — Inknut Antiqua, teal text, red bg
 * ∃     — Inknut Antiqua, white text, red bg
 * tehr  — Consolas, teal text, purple bg
 * N     — Inknut Antiqua, white text, blue bg
 * ET    — Consolas, white text, blue bg
 *
 * Props:
 *   scale     — multiplier on the base 16px font size (default 1)
 *   className — extra wrapper classes
 */

interface EyetehrnetLogoProps {
  scale?: number;
  className?: string;
}

export default function EyetehrnetLogo({ scale = 1, className = '' }: EyetehrnetLogoProps) {
  const fontSize = 16 * scale;
  const px = Math.max(1, Math.round(2 * scale));

  const consolas = 'Consolas, "Courier New", monospace';
  const inknut = '"Inknut Antiqua", serif';

  const red = '#E8585A';
  const teal = '#2DB8A0';
  const purple = '#582a72';
  const blue = '#002F6C';

  const box = (bg: string, color: string, font: string, weight: number, extraFontSize?: number): React.CSSProperties => ({
    fontFamily: font,
    background: bg,
    color,
    fontWeight: weight,
    fontSize: extraFontSize ? `${fontSize * extraFontSize}px` : `${fontSize}px`,
    padding: `0 ${px}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    letterSpacing: '-0.02em',
  });

  return (
    <span
      className={className}
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'stretch',
        gap: 0,
        whiteSpace: 'nowrap',
        overflow: 'visible',
      }}
    >
      <span style={{ ...box(red, '#000', consolas, 700), padding: `${Math.round(2 * scale)}px 1px 0`, marginRight: '-1px' }}>E</span>
      <span style={{ ...box(red, teal, inknut, 700), overflow: 'visible', padding: '0 0', marginLeft: '-1px', marginRight: '-1px' }}>Ŷ</span>
      <span style={{ ...box(red, '#fff', inknut, 900), padding: '0 1px', marginLeft: '-1px' }}>∃</span>
      <span style={{ ...box(purple, teal, consolas, 400), padding: `${Math.round(2 * scale)}px ${px}px 0`, marginRight: '-1px' }}>tehr</span>
      <span style={{ ...box(blue, '#fff', inknut, 700, 1.15), padding: '0 0', marginLeft: '-1px', marginRight: '-1px' }}>N</span>
      <span style={{ ...box(blue, '#fff', consolas, 600), alignItems: 'flex-end', padding: `0 ${Math.max(2, Math.round(2 * scale))}px 0 0`, letterSpacing: '0.05em', marginLeft: '-1px' }}>ET</span>
    </span>
  );
}
