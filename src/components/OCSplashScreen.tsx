import { useState, useEffect } from 'react';
import { BookOpen, Shield, Sparkles, ArrowRight, X } from 'lucide-react';

interface OCSplashScreenProps {
  onDismiss: () => void;
  onOpenPresets: () => void;
}

export default function OCSplashScreen({ onDismiss, onOpenPresets }: OCSplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('oc_splash_dismissed');
    if (dismissed) {
      setIsVisible(false);
    }
  }, []);

  const handleDismiss = (permanent: boolean = false) => {
    setIsAnimating(true);
    if (permanent) {
      localStorage.setItem('oc_splash_dismissed', 'true');
    }
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 400);
  };

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-[90] flex items-center justify-center p-4 transition-all duration-500 ${
        isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d3e50]/95 via-[#2d3e50]/90 to-[#3d5060]/95 backdrop-blur-md" />
      
      {/* Content */}
      <div className="relative max-w-2xl w-full">
        {/* Close button */}
        <button
          onClick={() => handleDismiss(false)}
          className="absolute -top-3 -right-3 w-8 h-8 bg-[#faf8f5] rounded-full flex items-center justify-center text-[#2d3e50] hover:bg-[#c6a679] hover:text-white transition-colors shadow-lg z-10"
        >
          <X size={16} />
        </button>

        <div className="bg-[#faf8f5] rounded-2xl border border-[#c6a679]/30 shadow-2xl overflow-hidden">
          {/* Top accent bar */}
          <div className="h-1.5 bg-gradient-to-r from-[#c6a679] via-[#2d3e50] to-[#c6a679]" />
          
          <div className="p-8 md:p-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#c6a679]/10 border border-[#c6a679]/30 rounded-full mb-6">
              <span className="w-2 h-2 bg-[#c6a679] rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-[#8b7347] uppercase tracking-wider">
                Odessa College — Position 14528
              </span>
            </div>

            {/* Title */}
            <h1 
              className="text-3xl md:text-4xl font-bold text-[#2d3e50] mb-3 leading-tight"
              style={{ fontFamily: 'var(--font-crimson), Georgia, serif' }}
            >
              Faculty Prompt Lab
            </h1>
            <p className="text-[#8b7347] text-sm font-medium mb-6">
              Powered by the Meta-Prompt Architect Engine
            </p>

            {/* Description */}
            <p className="text-[#555] leading-relaxed mb-8">
              This tool transforms instructional intent into hardened, production-ready prompts 
              through a three-phase pipeline: <strong>Audit</strong>, <strong>Quality Check</strong>, and{' '}
              <strong>Synthesis</strong>. Designed specifically for Odessa College faculty to create 
              transparent, AI-ready instructional materials aligned with the{' '}
              <em>AI-Augmented Instructional Integrity Framework</em>.
            </p>

            {/* Feature cards */}
            <div className="grid md:grid-cols-3 gap-3 mb-8">
              <div className="bg-[#f5f0e8] rounded-lg p-4 border border-[#e8e2d8]">
                <div className="w-8 h-8 bg-[#2d3e50] rounded-lg flex items-center justify-center mb-3">
                  <BookOpen size={16} className="text-[#c6a679]" />
                </div>
                <h3 className="font-semibold text-[#2d3e50] text-sm mb-1">6 Faculty Presets</h3>
                <p className="text-xs text-[#666]">Essay prompts, rubrics, discussions, quizzes, AI policies, tutoring scripts</p>
              </div>
              <div className="bg-[#f5f0e8] rounded-lg p-4 border border-[#e8e2d8]">
                <div className="w-8 h-8 bg-[#2d3e50] rounded-lg flex items-center justify-center mb-3">
                  <Shield size={16} className="text-[#c6a679]" />
                </div>
                <h3 className="font-semibold text-[#2d3e50] text-sm mb-1">Integrity Checking</h3>
                <p className="text-xs text-[#666]">PII scanning, adversarial review, cross-model parity testing</p>
              </div>
              <div className="bg-[#f5f0e8] rounded-lg p-4 border border-[#e8e2d8]">
                <div className="w-8 h-8 bg-[#2d3e50] rounded-lg flex items-center justify-center mb-3">
                  <Sparkles size={16} className="text-[#c6a679]" />
                </div>
                <h3 className="font-semibold text-[#2d3e50] text-sm mb-1">Export Ready</h3>
                <p className="text-xs text-[#666]">Markdown, JSON, Cursor rules, or bundled ZIP for your syllabus</p>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => { handleDismiss(false); onOpenPresets(); }}
                className="flex-1 bg-[#2d3e50] hover:bg-[#3d5060] text-white px-6 py-3.5 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles size={16} />
                Browse Faculty Presets
              </button>
              <button
                onClick={() => handleDismiss(false)}
                className="flex-1 border border-[#c6a679] text-[#8b7347] hover:bg-[#c6a679]/10 px-6 py-3.5 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                Start From Scratch
                <ArrowRight size={16} />
              </button>
            </div>

            {/* Don't show again */}
            <button
              onClick={() => handleDismiss(true)}
              className="w-full mt-4 text-xs text-[#999] hover:text-[#666] transition-colors text-center"
            >
              Don&apos;t show this screen again
            </button>
          </div>

          {/* Footer */}
          <div className="bg-[#2d3e50] px-8 py-3 flex items-center justify-between">
            <span className="text-xs text-white/60">Corey Alejandro — Candidate, Director of Instructional Support</span>
            <span className="text-xs text-[#c6a679]">Position 14528</span>
          </div>
        </div>
      </div>
    </div>
  );
}
