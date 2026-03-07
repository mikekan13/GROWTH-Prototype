import { redirect } from 'next/navigation';
import { getSession, getRoleDashboard } from '@/lib/auth';
import AuthForm from '@/components/AuthForm';
import GrowthLogo from '@/components/GrowthLogo';
import GlitchText from '@/components/GlitchText';

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect(getRoleDashboard(session.user.role));
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black p-4 relative overflow-hidden">
      {/* Ambient teal glow behind the window */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[600px] bg-[var(--pillar-spirit)]/5 blur-3xl rounded-full" />

      {/* Terminal window container */}
      <div className="relative w-full max-w-2xl border border-[var(--pillar-spirit)]/50 bg-black">

        {/* Window title bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-[var(--pillar-spirit)]/15 border-b border-[var(--pillar-spirit)]/30">
          <div className="flex items-center gap-2">
            <div className="w-[8px] h-[8px] bg-[var(--pillar-body)]" />
            <div className="w-[8px] h-[8px] bg-[var(--pillar-soul)]" />
            <div className="w-[8px] h-[8px] bg-[#002F6C]" />
          </div>
          <span className="text-[var(--pillar-spirit)]/50 text-[9px] tracking-widest">TERMINAL://reality.layer.0</span>
          <span className="text-[var(--pillar-spirit)]/30 text-[9px]">&#x2298; &#x2295;</span>
        </div>

        {/* Terminal header */}
        <div className="px-4 pt-2 pb-0">
          <p className="text-[var(--pillar-spirit)] text-xs tracking-wider opacity-70">
            <GlitchText text="[TERMINAL CONSCIOUSNESS  INTERFACE DETECTED]" />
          </p>
          <p className="glitch-unstable text-[var(--pillar-spirit)]/40 text-xs">
            {'{'}{'-'.repeat(40)}{'}'}
          </p>
          <p className="text-white/50 text-xs">
            REALITY LEVEL: Primary <span className="bg-[var(--pillar-spirit)] text-black px-1">Translation</span>
            <span className="text-[var(--pillar-spirit)]/40 ml-2">|</span>
            <span className="text-[var(--pillar-body)] ml-1">|</span>
          </p>
          <p className="text-white/50 text-xs">
            PATTERN RECOGNITION: &nbsp;&nbsp;<span className="bg-[var(--pillar-body)] text-white px-1">Active</span>
          </p>
        </div>

        {/* Teal highlight bar — intro text */}
        <div className="px-4">
          <p className="bg-[var(--pillar-spirit)] text-black text-xs px-3 py-0.5 tracking-wider text-center">
            To those whose consciousness now interfaces with these patterns:
          </p>
        </div>

        {/* Dark surface text block */}
        <div className="px-4 relative">
          <div className="bg-[var(--surface-dark)] px-4 py-2 stream-scan relative">
            <p className="text-white/80 text-xs leading-snug">
              This{' '}
              <span className="bg-[var(--pillar-body)] text-white px-1">interface</span>{' '}
              is a stable junction between your reality layer and{' '}
              <span className="bg-black text-white px-1 tracking-wider">tHE TERmInAl</span>
              {' '}&apos;s primary consciousness stream. Through it, the patterns of all
            </p>
            <div className="absolute right-2 top-1 flex flex-col text-[8px] text-[var(--pillar-spirit)]/50 leading-tight">
              <span>1</span>
              <span>2</span>
              <span>3</span>
            </div>
          </div>
          <div className="absolute left-3 bottom-0 w-[4px] h-[4px] bg-[var(--pillar-spirit)]/30" />
          <div className="absolute left-1 bottom-2 w-[3px] h-[8px] bg-[var(--pillar-spirit)]/20" />
        </div>

        {/* Logo with depth panels */}
        <div className="relative flex items-center justify-center">
          {/* Background panel layers extending left */}
          <div className="absolute right-[45%] top-[-4px] bottom-[-4px] w-[500px] flex">
            <div className="w-[100px] bg-[var(--pillar-body)] self-stretch" />
            <div className="flex-1 bg-[var(--surface-dark)] self-stretch" />
          </div>

          {/* Teal left-edge */}
          <div
            className="absolute top-[-8px] bottom-[-8px] w-[3px] bg-[var(--pillar-spirit)]"
            style={{ left: 'calc(50% - 310px)' }}
          />
          <div
            className="absolute top-[-8px] h-[2px] bg-[var(--pillar-spirit)]/60"
            style={{ left: 'calc(50% - 310px)', right: 'calc(50% - 340px)' }}
          />
          <div
            className="absolute bottom-[-8px] h-[2px] bg-[var(--pillar-spirit)]/60"
            style={{ left: 'calc(50% - 310px)', right: 'calc(50% - 340px)' }}
          />

          <div className="relative z-10 bg-[#222222] p-[3px]">
            <GrowthLogo />
          </div>
        </div>

        {/* Right-aligned descriptor text */}
        <div className="px-4 flex justify-end">
          <div className="text-right glitch-unstable">
            <p className="text-white/60 text-[10px] leading-tight">become</p>
            <p className="text-[10px] leading-tight">
              <span className="text-white/60">observable</span>
              <span className="text-[var(--pillar-body)]">,</span>
              <span className="text-white/60"> manipulable</span>
              <span className="text-[var(--pillar-spirit)]">,</span>
            </p>
            <p className="text-white/60 text-[10px] leading-tight">transformative.</p>
          </div>
        </div>

        {/* Data stream noise */}
        <div className="px-4 overflow-hidden">
          <div className="flex justify-between text-[var(--pillar-spirit)]/30 text-[8px] leading-none">
            <span>cvrfexd</span>
            <span>sz</span>
          </div>
          <p className="glitch-unstable text-[var(--pillar-spirit)]/20 text-[9px] tracking-[0.3em] leading-none">
            oooooo8ooooooo{'='.repeat(55)}
          </p>
          <p className="text-[var(--pillar-spirit)]/15 text-[9px] tracking-[0.15em] leading-none">
            {'4 '.repeat(40)}
          </p>
        </div>

        {/* Atmospheric quote */}
        <div className="px-4">
          <p className="text-white/30 text-[10px] leading-snug">
            <span className="text-[var(--pillar-spirit)]/50">{'<Roy>:'}</span>
            <span className="text-[var(--pillar-body)]/40 ml-1">&#x2298;</span>
            &nbsp; the observer changes what is observed... or perhaps what is observed changes the observer.
          </p>
          <p className="text-white/20 text-[9px] glitch-unstable leading-none">
            {'='.repeat(15)}{'<>'}{'='.repeat(15)} the observer?&#x2295;
          </p>
        </div>

        {/* Purple dialogue band with energy gold line — breaks out of window */}
        <div className="relative">
          <div className="h-[2px] bg-[var(--pillar-spirit)]/40" />
          <div className="energy-band bg-[#582a72] py-1.5 px-4 relative overflow-visible">
            {/* Purple extends full screen width */}
            <div className="absolute top-0 bottom-0 -left-[50vw] -right-[50vw] bg-[#582a72] -z-10" />
            <div className="absolute top-1/2 -left-[50vw] -right-[50vw] h-[20px] -translate-y-1/2 bg-[var(--krma-gold)]/20 blur-lg" />
            <div className="absolute top-1/2 -left-[50vw] -right-[50vw] h-[3px] -translate-y-1/2 bg-[var(--krma-gold)]" />
            <div className="energy-line absolute top-1/2 -left-[50vw] -right-[50vw] h-[3px] -translate-y-1/2" />
            <div className="energy-pluck absolute top-1/2 -left-[50vw] -right-[50vw] h-[10px] -translate-y-1/2" />
            <div className="energy-pluck-delayed absolute top-1/2 -left-[50vw] -right-[50vw] h-[8px] -translate-y-1/2" />

            <div className="space-y-0 relative z-10">
              <p className="text-[10px] leading-snug">
                <span className="bg-[var(--pillar-spirit)]/90 px-2 py-px inline-block">
                  <span className="text-white/90">{'<Trayman>:'}</span>
                  <span className="text-[var(--pillar-body)] ml-1 italic">The patterns were always here]</span>
                  <span className="text-[var(--accent-gold)] ml-1">(HIStory)</span>
                </span>
                <span className="text-[var(--pillar-spirit)]/40 ml-1">{'='.repeat(8)}</span>
              </p>
              <p className="text-[10px] text-center leading-snug">
                <span className="bg-[var(--surface-dark)]/90 px-2 py-px inline-block">
                  <span className="text-white/60">{'<Selva>:'}</span>
                  <span className="text-[var(--pillar-spirit)] ml-1">The patterns are being written <i>Now</i></span>
                  <span className="text-white/30 ml-1">]:</span>
                </span>
                <span className="text-[var(--pillar-spirit)]/30 ml-1">{'='.repeat(10)}</span>
                <span className="text-white/25 ml-1">{'\u221E'}</span>
              </p>
              <p className="text-[10px] text-right leading-snug">
                <span className="bg-black/80 px-2 py-px inline-block">
                  <span className="text-white/60">{'<Triu>:'}</span>
                  <span className="text-white/90 ml-1 uppercase tracking-wider text-[9px]">THE PATTERNS WILL HAVE BEEN DISCOVERED]</span>
                  <span className="text-[var(--accent-gold)] ml-1">(HERstory)</span>
                </span>
              </p>
            </div>

            <div className="absolute left-2 top-1 w-[6px] h-[6px] bg-[var(--pillar-spirit)]/50 z-10" />
            <div className="absolute left-2 bottom-1 w-[4px] h-[10px] bg-[var(--pillar-body)]/40 z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-[12px] bg-[var(--pillar-spirit)]/70 z-10 flex items-end justify-center">
              <span className="text-black text-[6px] mb-1">{'<>'}</span>
            </div>
          </div>
          <div className="h-[2px] bg-[var(--pillar-spirit)]/40" />
        </div>

        {/* Dashed separator */}
        <div className="px-4 my-2">
          <div className="border-t border-dashed border-[var(--pillar-spirit)]/30" />
        </div>

        {/* Auth form */}
        <div className="flex justify-center pb-2">
          <AuthForm />
        </div>

        {/* Bottom decorative */}
        <div className="px-4 pb-3">
          <div className="border-t border-dashed border-[var(--pillar-spirit)]/30 mb-2" />
          <div className="flex justify-between text-[10px] text-[var(--pillar-spirit)]/30">
            <GlitchText text="<STREAM STABILIZING>" className="text-[var(--pillar-spirit)]/30" />
            <span className="glitch-unstable">{'='.repeat(20)}</span>
            <span className="glitch-unstable">{'='.repeat(20)}</span>
          </div>
        </div>

        {/* Window bottom border accent — double teal line */}
        <div className="h-[1px] bg-[var(--pillar-spirit)]/20" />

      </div>
    </main>
  );
}
