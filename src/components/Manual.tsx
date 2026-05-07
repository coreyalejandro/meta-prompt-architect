import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Book, Target, Zap, Shield, Layers, Cpu, Terminal, CheckCircle2, Info, HelpCircle, X, ShieldAlert, GitBranch, Share2, BarChart3, MessageSquare } from 'lucide-react';

interface ManualProps {
  isOpen: boolean;
  onClose: () => void;
}

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative flex items-center" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {children}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute bottom-full left-0 mb-2 w-48 bg-[#1a1a1a] border border-[#333] p-2 rounded-sm shadow-xl z-[110] pointer-events-none"
          >
            <p className="text-[9px] text-[#aaa] leading-tight">{text}</p>
            <div className="absolute top-full left-2 w-2 h-2 bg-[#1a1a1a] border-r border-b border-[#333] rotate-45 -mt-1" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Manual({ isOpen, onClose }: ManualProps) {
  if (!isOpen) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-[#000]/90 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-[#0f0f0f] border border-[#1a1a1a] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col rounded-sm shadow-2xl"
      >
        {/* Header */}
        <div className="border-b border-[#1a1a1a] p-4 flex items-center justify-between bg-[#050505]">
          <div className="flex items-center gap-3">
            <Book className="text-[#00ff00]" size={20} />
            <h2 className="text-sm font-bold uppercase tracking-widest">Golden Documentation: Meta-Prompt Architect v2.0</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-[#666] hover:text-[#e0e0e0] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-12 custom-scrollbar selection:bg-[#00ff00] selection:text-[#000]">
          
          {/* Section 0: Structured Prompt Pipeline */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[#00ff00]">
              <Cpu size={18} />
              <h3 className="text-xs font-bold uppercase tracking-wider">00. Structured Prompt Pipeline</h3>
            </div>
            <div className="bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm">
              <p className="text-[11px] text-[#e0e0e0] font-bold mb-2 uppercase tracking-tighter">Structured Prompt Pipeline</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-2 border border-[#1a1a1a] bg-[#0a0a0a]">
                  <span className="text-[9px] text-[#00ff00] block font-bold">[C]OGNITIVE</span>
                  <p className="text-[9px] text-[#666]">High-dimensional reasoning and intent synthesis.</p>
                </div>
                <div className="p-2 border border-[#1a1a1a] bg-[#0a0a0a]">
                  <span className="text-[9px] text-[#00ff00] block font-bold">[R]ECURSIVE</span>
                  <p className="text-[9px] text-[#666]">Self-correcting loops that refine logic over multiple passes.</p>
                </div>
                <div className="p-2 border border-[#1a1a1a] bg-[#0a0a0a]">
                  <span className="text-[9px] text-[#00ff00] block font-bold">[S]YSTEM</span>
                  <p className="text-[9px] text-[#666]">Architectural integrity and cross-model compatibility.</p>
                </div>
                <div className="p-2 border border-[#1a1a1a] bg-[#0a0a0a]">
                  <span className="text-[9px] text-[#00ff00] block font-bold">[P]ROMPTING</span>
                  <p className="text-[9px] text-[#666]">The final executable instruction layer.</p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-[#001100] border border-[#00ff00]/20">
                <p className="text-[10px] text-[#aaa]">
                  <span className="text-[#00ff00] font-bold">THE PIPELINE:</span> The pipeline runs three sequential reasoning phases — intent audit, adversarial stress test, and instruction synthesis — before producing the final prompt artifact.
                </p>
              </div>
            </div>
          </section>

          {/* Section 1: The Core Concept */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[#00ff00]">
              <Target size={18} />
              <h3 className="text-xs font-bold uppercase tracking-wider">01. Prompt Architecture (How It Works)</h3>
            </div>
            <p className="text-sm text-[#aaa] leading-relaxed">
              Standard AI prompts often fail because they lack structural logic and fail to account for edge cases. This tool acts as a <span className="text-[#e0e0e0] font-bold">Cognitive Governance Layer</span>, transforming underspecified intent into structured, stress-tested instruction sets optimized for cross-model reliability.
            </p>
            <div className="bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm border-l-2 border-l-[#00ff00]">
              <p className="text-[11px] text-[#888] italic">
                "Each output is a versioned instruction artifact: a system role, a verification gate sequence, and a final prompt optimized for the target model."
              </p>
            </div>
          </section>

          {/* Section 2: Advanced Governance Features */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-[#00ff00]">
              <Shield size={18} />
              <h3 className="text-xs font-bold uppercase tracking-wider">02. Safety and Compliance Features</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm">
                <div className="flex items-center gap-2 text-[#ff0000] mb-2">
                  <ShieldAlert size={14} />
                  <span className="text-[10px] font-bold uppercase">Adversarial Red-Teaming</span>
                </div>
                <p className="text-[10px] text-[#666]">
                  Automatically tests generated prompts for safety bypasses and logical vulnerabilities before they reach the target session.
                </p>
              </div>
              <div className="bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm">
                <div className="flex items-center gap-2 text-[#00ff00] mb-2">
                  <BarChart3 size={14} />
                  <span className="text-[10px] font-bold uppercase">Constitutional Mapping</span>
                </div>
                <p className="text-[10px] text-[#666]">
                  Traces every Verification Gate back to specific regulatory or safety standards (e.g., EU AI Act, NIST).
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Developer Workflow */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-[#00ff00]">
              <Terminal size={18} />
              <h3 className="text-xs font-bold uppercase tracking-wider">03. Developer Tooling</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[#00ff00]">
                  <GitBranch size={14} />
                  <span className="text-[10px] font-bold uppercase">Git-for-Prompts</span>
                </div>
                <p className="text-[10px] text-[#666]">
                  Full version control for your prompts. Commit, branch, and diff architectural iterations with ease.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[#0088ff]">
                  <Share2 size={14} />
                  <span className="text-[10px] font-bold uppercase">Direct IDE Handoff</span>
                </div>
                <p className="text-[10px] text-[#666]">
                  One-click export for Cursor, Claude Code, and agentic IDEs. Generates `.cursorrules` automatically.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[#ffaa00]">
                  <Cpu size={14} />
                  <span className="text-[10px] font-bold uppercase">Token Budgeting</span>
                </div>
                <p className="text-[10px] text-[#666]">
                  Real-time cost estimation and hard guardrails for recursive AI pipelines to prevent runaway spend.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: On-Demand Support */}
          <section className="bg-[#001100] border border-[#004400] p-6 rounded-sm space-y-4">
            <div className="flex items-center gap-2 text-[#00ff00]">
              <MessageSquare size={18} />
              <h3 className="text-xs font-bold uppercase tracking-wider">04. Knowledge Expert (On-Demand)</h3>
            </div>
            <p className="text-[11px] text-[#aaa] leading-relaxed">
              Stuck on a complex build? Use the <span className="text-[#00ff00] font-bold">floating Expert bubble</span> in the bottom-right corner. Our integrated AI assistant has full context of your current build and can provide real-time architectural advice.
            </p>
          </section>

          {/* Section 5: Mastery Controls */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[#00ff00]">
              <Zap size={18} />
              <h3 className="text-xs font-bold uppercase tracking-wider">05. Mastery Controls (LCI & Sampling)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm">
                <h4 className="text-[10px] font-bold text-[#e0e0e0] uppercase mb-2">LCI (Linear Context Injection)</h4>
                <p className="text-[10px] text-[#666] mb-3">
                  Context window optimization to maximize context window efficiency for long-running tasks.
                </p>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <span className="text-[8px] text-[#00ff00] uppercase block font-bold mb-1">Context Window</span>
                    <p className="text-[9px] text-[#444]">Buffer size for memory stability.</p>
                  </div>
                  <div className="flex-1">
                    <span className="text-[8px] text-[#00ff00] uppercase block font-bold mb-1">Compression Ratio</span>
                    <p className="text-[9px] text-[#444]">Nuance vs. Token efficiency.</p>
                  </div>
                </div>
              </div>
              <div className="bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm">
                <h4 className="text-[10px] font-bold text-[#e0e0e0] uppercase mb-2">Verbalized Sampling</h4>
                <p className="text-[10px] text-[#666] mb-3">
                  The system's internal monologue. It evaluates multiple architectures (CoT, Few-Shot, Role-Based) before selecting the optimal path.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6: UI Navigation & Controls */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[#00ff00]">
              <Layers size={18} />
              <h3 className="text-xs font-bold uppercase tracking-wider">06. UI Navigation & Controls</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-[#e0e0e0] uppercase">Top-Level Nav</h4>
                <ul className="text-[10px] text-[#666] space-y-2">
                  <li><span className="text-[#00ff00]">HISTORY (Cmd+H):</span> Access all previous build iterations and search history.</li>
                  <li><span className="text-[#00ff00]">HELP_GUIDE (Cmd+/):</span> Opens this manual for architectural reference.</li>
                  <li><span className="text-[#00ff00]">RESET:</span> Clears the current session and resets the cognitive pipeline.</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-[#e0e0e0] uppercase">Main Tabs</h4>
                <ul className="text-[10px] text-[#666] space-y-2">
                  <li><span className="text-[#00ff00]">Executable_Prompt:</span> The final hardened instruction set for your AI.</li>
                  <li><span className="text-[#00ff00]">Verbalized_Sampling:</span> Internal reasoning logs and architecture selection.</li>
                  <li><span className="text-[#00ff00]">Cognitive_Audit:</span> Raw JSON data of the three-phase reasoning pipeline.</li>
                  <li><span className="text-[#00ff00]">Snippets:</span> Pre-formatted text for GitHub, resumes, and pitches.</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-[#e0e0e0] uppercase">Global Controls</h4>
                <ul className="text-[10px] text-[#666] space-y-2">
                  <li><span className="text-[#00ff00]">Cognitive Load Monitor:</span> Visualizes reasoning density to prevent model collapse.</li>
                  <li><span className="text-[#00ff00]">Redact PII:</span> Automated security layer to prevent data leaks.</li>
                  <li><span className="text-[#00ff00]">Export Suite:</span> Download as JSON, Markdown, or .cursorrules.</li>
                </ul>
              </div>
            </div>
          </section>

          <footer className="pt-8 text-center border-t border-[#1a1a1a]">
            <p className="text-[10px] text-[#444] uppercase mb-4 tracking-widest">Version 2.0 | Cognitive Governance Protocol</p>
            <button 
              onClick={onClose}
              className="bg-[#00ff00] text-[#000] px-12 py-4 text-xs font-bold uppercase tracking-widest hover:bg-[#00cc00] transition-all shadow-[0_0_20px_rgba(0,255,0,0.2)]"
            >
              Initialize Architect Session
            </button>
          </footer>
        </div>
      </motion.div>
    </motion.div>
  );
}
