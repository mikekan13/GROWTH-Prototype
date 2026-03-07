/**
 * GRO<n>WTH Logo — canonical rendering.
 * Pixel-matched to GROWTHlogo.png from the Core Rulebook.
 * DO NOT modify colors, proportions, or structure without Mike's approval.
 *
 * Scale prop controls size (1 = base 103px font). All dimensions scale proportionally.
 */

interface GrowthLogoProps {
  scale?: number;
}

export default function GrowthLogo({ scale = 1 }: GrowthLogoProps) {
  const s = (px: number) => px * scale;

  return (
    <div className="relative inline-flex items-end" style={{ gap: 0 }} aria-label="GRO.WTH">
      {/* Black T-bar: crossbar above panels with #222 highlight on top-left */}
      <div
        className="absolute z-10 overflow-hidden"
        style={{
          bottom: '100%',
          left: `calc(50% - ${s(95)}px)`,
          width: `${s(190)}px`,
          height: `${s(15)}px`,
          background: '#000000',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${s(22)}px`,
            height: '100%',
            background: '#222222',
          }}
        />
      </div>
      {/* Slim cream panel left of G */}
      <span className="self-stretch bg-[#F5F4EF]" style={{ width: `${s(8)}px` }} />
      {/* G — coral red on white */}
      <span
        className="flex items-center justify-center text-[#F7525F] bg-[#FFFFFF] font-[family-name:var(--font-terminal)] font-bold leading-none"
        style={{ fontSize: `${s(103)}px`, padding: `${s(18)}px ${s(0.5)}px` }}
      >
        G
      </span>
      {/* R — muted pink on dark gray */}
      <span
        className="flex items-center justify-center text-[#E06666] bg-[#393937] font-[family-name:var(--font-terminal)] font-bold leading-none"
        style={{ fontSize: `${s(103)}px`, padding: `${s(18)}px ${s(0.5)}px` }}
      >
        R
      </span>
      {/* O — light pink on near-black */}
      <span
        className="flex items-center justify-center text-[#F4CCCC] bg-[#222222] font-[family-name:var(--font-terminal)] font-bold leading-none"
        style={{ fontSize: `${s(103)}px`, padding: `${s(18)}px ${s(0.5)}px` }}
      >
        O
      </span>
      {/* Black stem with gold <n> */}
      <span
        className="relative bg-[#000000] self-stretch z-10 flex items-end justify-center"
        style={{ width: `${s(9)}px` }}
      >
        <span
          className="text-[#856A3F] font-[family-name:var(--font-terminal)] font-bold leading-none"
          style={{
            fontSize: `${s(6)}px`,
            marginBottom: `${s(34)}px`,
            letterSpacing: `${s(-0.75)}px`,
          }}
        >
          &lt;n&gt;
        </span>
      </span>
      {/* W — ice blue on near-black */}
      <span
        className="flex items-center justify-center text-[#CFE2F3] bg-[#222222] font-[family-name:var(--font-terminal)] font-bold leading-none"
        style={{ fontSize: `${s(103)}px`, padding: `${s(18)}px ${s(0.5)}px` }}
      >
        W
      </span>
      {/* T — cornflower blue on dark gray */}
      <span
        className="flex items-center justify-center text-[#6FA8DC] bg-[#393937] font-[family-name:var(--font-terminal)] font-bold leading-none"
        style={{ fontSize: `${s(103)}px`, padding: `${s(18)}px ${s(0.5)}px` }}
      >
        T
      </span>
      {/* H — dark navy on cream */}
      <span
        className="flex items-center justify-center text-[#002F6C] bg-[#F5F4EF] font-[family-name:var(--font-terminal)] font-bold leading-none"
        style={{ fontSize: `${s(103)}px`, padding: `${s(18)}px ${s(0.5)}px` }}
      >
        H
      </span>
    </div>
  );
}
