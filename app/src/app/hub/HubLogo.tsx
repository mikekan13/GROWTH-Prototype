'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import EyetehrnetLogo from '@/components/EyetehrnetLogo';

export default function HubLogo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const [cssScale, setCssScale] = useState(1);
  const [logoH, setLogoH] = useState(20);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const logo = logoRef.current;
    if (!container || !logo) return;

    logo.style.transform = 'scale(1)';
    const rect = logo.getBoundingClientRect();
    const containerW = container.getBoundingClientRect().width;

    if (rect.width > 0) {
      const s = containerW / rect.width;
      setCssScale(s);
      setLogoH(rect.height);
      logo.style.transform = `scale(${s})`;
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(measure, 100);
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [measure]);

  const visH = Math.round(logoH * cssScale);

  return (
    <div ref={containerRef} className="w-full relative" style={{ height: `${visH}px` }}>
      {/* Black box — half logo height, top center, masks feed behind upper half of logo */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 bg-black"
        style={{ width: '100%', height: `${Math.round(visH / 2)}px` }}
      />
      {/* Logo, scaled to fill width */}
      <div
        ref={logoRef}
        className="absolute top-0 left-0"
        style={{ transformOrigin: 'top left' }}
      >
        <EyetehrnetLogo scale={1} />
      </div>
    </div>
  );
}
