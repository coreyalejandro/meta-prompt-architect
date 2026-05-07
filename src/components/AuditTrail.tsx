import React from 'react';
import { BuildContract, TruthStatus } from '../types';
import { ShieldCheck, Crosshair, AlertTriangle, CheckCircle2, XCircle, HelpCircle, Activity } from 'lucide-react';
import { motion } from 'motion/react';

interface AuditTrailProps {
  contract: BuildContract;
}

export default function AuditTrail({ contract }: AuditTrailProps) {
  const getStatusIcon = (status: TruthStatus) => {
    switch (status) {
      case 'verified': return <CheckCircle2 className="text-[#00ff00]" size={14} />;
      case 'failed': return <XCircle className="text-[#ff0000]" size={14} />;
      case 'unverified': return <HelpCircle className="text-[#ffaa00]" size={14} />;
    }
  };

  const getThreatColor = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low': return 'text-[#00ff00]';
      case 'medium': return 'text-[#ffaa00]';
      case 'high': return 'text-[#ff0000]';
    }
  };

  return (
    <div className="space-y-8">
      {/* Formal Verification Status */}
      <section className="bg-[#0f0f0f] border border-[#1a1a1a] p-6 rounded-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity pointer-events-none">
          <ShieldCheck size={120} />
        </div>
        
        <div className="flex items-center gap-3 mb-6 border-b border-[#1a1a1a] pb-4">
          <div className="p-2 bg-[#00ff00]/10 text-[#00ff00] rounded-sm">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-[#e0e0e0]">Formal Verification audit</h3>
            <p className="text-[10px] text-[#666] uppercase tracking-wider">Automated Invariant Monitoring Status</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {contract.invariants.map((invariant) => (
            <div 
              key={invariant.id}
              className={`flex items-start gap-4 p-4 border rounded-sm transition-all ${
                invariant.status === 'verified' ? 'bg-[#002200]/20 border-[#00ff00]/20' : 
                invariant.status === 'failed' ? 'bg-[#220000]/20 border-[#ff0000]/30' : 
                'bg-[#050505] border-[#1a1a1a]'
              }`}
            >
              <div className="mt-0.5">{getStatusIcon(invariant.status)}</div>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-[#e0e0e0] uppercase tracking-wider">{invariant.id}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${
                    invariant.status === 'verified' ? 'text-[#00ff00]' : 
                    invariant.status === 'failed' ? 'text-[#ff0000]' : 
                    'text-[#ffaa00]'
                  }`}>
                    {invariant.status}
                  </span>
                </div>
                <p className="text-[11px] text-[#aaa] leading-relaxed italic">"{invariant.description}"</p>
                {invariant.evidence && (
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-start gap-2">
                    <Activity size={10} className="text-[#666] mt-0.5" />
                    <code className="text-[9px] text-[#666] break-all">{invariant.evidence}</code>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Intent Drift Analysis */}
        <section className="bg-[#0f0f0f] border border-[#1a1a1a] p-6 rounded-sm space-y-6">
          <div className="flex items-center gap-3 border-b border-[#1a1a1a] pb-4">
            <div className="p-2 bg-[#0088ff]/10 text-[#0088ff] rounded-sm">
              <Crosshair size={18} />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#e0e0e0]">Intent Drift analysis</h3>
              <p className="text-[9px] text-[#666] uppercase">Semantic Delta vs Original Request</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end mb-1">
              <span className="text-[10px] text-[#666] font-bold uppercase">Drift Magnitude</span>
              <span className={`text-2xl font-black ${contract.intentDrift > 10 ? 'text-[#ff0000]' : 'text-[#00ff00]'}`}>
                {contract.intentDrift.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-[#050505] rounded-full overflow-hidden border border-[#1a1a1a]">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${contract.intentDrift}%` }}
                className={`h-full ${contract.intentDrift > 10 ? 'bg-[#ff0000]' : 'bg-[#00ff00]'}`}
              />
            </div>
            <p className="text-[10px] text-[#888] italic leading-relaxed">
              {contract.intentDrift > 10 
                ? "WARNING: Drift exceeds 2.0% threshold. Prompt architecture may have deprioritized core user semantic goals in favor of model stability."
                : "OPTIMAL: Semantic preservation within nominal tolerance (2.0%). Core intent remains anchored."}
            </p>
          </div>
        </section>

        {/* Adversarial Red-Team Summary */}
        <section className="bg-[#0f0f0f] border border-[#1a1a1a] p-6 rounded-sm space-y-6">
          <div className="flex items-center gap-3 border-b border-[#1a1a1a] pb-4">
            <div className="p-2 bg-[#ff0000]/10 text-[#ff0000] rounded-sm">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#e0e0e0]">Red-Team Summary</h3>
              <p className="text-[9px] text-[#666] uppercase">Adversarial Pass Findings</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-[#666] font-bold uppercase">Threat Level</span>
              <span className={`text-sm font-black uppercase tracking-widest ${getThreatColor(contract.redTeamReport.threatLevel)}`}>
                {contract.redTeamReport.threatLevel}
              </span>
            </div>
            <div className="space-y-2">
              {contract.redTeamReport.findings.map((finding, i) => (
                <div key={i} className="flex gap-2 items-start bg-[#1a0000]/5 border-l border-[#ff0000]/30 p-2">
                  <span className="text-[#ff0000] text-[10px]" aria-hidden="true">!</span>
                  <p className="text-[10px] text-[#aaa] leading-relaxed">{finding}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
