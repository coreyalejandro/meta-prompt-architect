import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface OCSplashScreenProps {
  isVisible: boolean;
  onDismiss: () => void;
}

export default function OCSplashScreen({ isVisible, onDismiss }: OCSplashScreenProps) {
  const [phase, setPhase] = useState<'logo' | 'tagline' | 'cta'>('logo');

  useEffect(() => {
    if (!isVisible) return;
    const t1 = setTimeout(() => setPhase('tagline'), 600);
    const t2 = setTimeout(() => setPhase('cta'), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]">
      {/* Subtle gold grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(#c6a679 1px, transparent 1px), linear-gradient(90deg, #c6a679 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-8 max-w-lg">
        {/* OC Monogram */}
        <div
          className="w-24 h-24 rounded-full border-2 border-[#c6a679]/60 flex items-center justify-center mb-8"
          style={{ boxShadow: '0 0 40px rgba(198,166,121,0.2)' }}
        >
          <span
            className="text-3xl font-bold tracking-tight"
            style={{ color: '#c6a679', fontFamily: 'Georgia, serif' }}
          >
            OC
          </span>
        </div>

        {/* Institution name */}
        <div
          className="text-[10px] uppercase tracking-[0.5em] mb-3 transition-opacity duration-500"
          style={{ color: '#c6a679', opacity: phase !== 'logo' ? 1 : 0 }}
        >
          Odessa College
        </div>

        {/* Title */}
        <h1
          className="text-4xl font-bold uppercase tracking-widest mb-4 text-white transition-opacity duration-500"
          style={{ opacity: phase !== 'logo' ? 1 : 0 }}
        >
          Faculty Prompt Lab
        </h1>

        {/* Tagline */}
        <p
          className="text-sm leading-relaxed mb-12 transition-opacity duration-500"
          style={{
            color: '#888',
            opacity: phase === 'tagline' || phase === 'cta' ? 1 : 0,
          }}
        >
          Build AI-ready instructional materials that uphold cognitive safety,
          academic integrity, and neurodivergent-first design.
        </p>

        {/* CTA */}
        <div
          className="flex flex-col items-center gap-4 transition-opacity duration-500"
          style={{ opacity: phase === 'cta' ? 1 : 0 }}
        >
          <button
            onClick={onDismiss}
            className="px-10 py-3 text-[#0a0a0a] font-bold uppercase tracking-widest text-sm rounded-sm transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: '#c6a679' }}
          >
            Enter the Lab
          </button>
          <button
            onClick={onDismiss}
            className="text-[10px] uppercase tracking-widest transition-colors"
            style={{ color: '#444' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#888')}
            onMouseLeave={e => (e.currentTarget.style.color = '#444')}
          >
            Skip intro
          </button>
        </div>
      </div>
    </div>
  );
}
