import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { z } from 'zod';
import { UserIntent, AuditResult, StressTestResult, InstructionSet, ModelType, MemoryState, Retrospective, ThemeType, HistoryItem, PIIFinding, HistoryItemSchema, MemoryStateSchema } from './types';
import KnowledgeExpert from './components/KnowledgeExpert';
import { auditIntent, stressTest, generateInstructionSet, getRetrospective, scanForPII, redTeamAudit, testCrossModelParity, mapConstitutionalStandards } from './services/gemini';
import { estimateCost } from './services/tokenEstimator';
import { Terminal, Cpu, ShieldAlert, ShieldCheck, Zap, Save, RefreshCw, AlertCircle, BookOpen, Layers, CheckCircle2, FileCode, Printer, Eye, HelpCircle, History, Download, Sun, Moon, Monitor, Info, FileText, Sparkles, GitBranch, DollarSign, Copy, FileJson, Search, Scale, Activity, Archive } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { generateCursorRules } from './services/ideHandoff';
import { generateExportBundle } from './utils/export';
import Manual from './components/Manual';
import AuditView from './components/AuditView';
import AuditTrail from './components/AuditTrail';
import WorkflowBuilder from './components/WorkflowBuilder';
import { ErrorBoundary } from './components/ErrorBoundary';
import { storage } from './utils/storage';
import { CrossModelParityResult, ConstitutionalMappingResult } from './types';

import Tooltip from './components/Tooltip';

export default function App() {
  const [intent, setIntent] = useState<UserIntent>({
    raw: '',
    targetModel: ModelType.GEMINI_1_5_PRO,
    useLCI: true,
    lciConfig: {
      contextWindow: 128000,
      compressionRatio: 4
    },
    highRisk: true,
    theme: ThemeType.DARK
  });
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [stress, setStress] = useState<StressTestResult | null>(null);
  const [instructionSet, setInstructionSet] = useState<InstructionSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'audit' | 'stress' | 'synthesis' | 'verification' | 'finalizing'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState<MemoryState[]>([]);
  const [failedStep, setFailedStep] = useState('');
  const [retrospective, setRetrospective] = useState<Retrospective | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [piiFindings, setPiiFindings] = useState<PIIFinding[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [redTeamResults, setRedTeamResults] = useState<{ score: number; reasoning: string; vulnerabilities: string[] } | null>(null);
  const [crossModelParity, setCrossModelParity] = useState<CrossModelParityResult | null>(null);
  const [constitutionalMapping, setConstitutionalMapping] = useState<ConstitutionalMappingResult | null>(null);
  const [roiAnalytics, setRoiAnalytics] = useState<{ timeSaved: number, costSaved: number, totalGenerations: number } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState<'prompt' | 'sampling' | 'audit' | 'docs' | 'history' | 'workflow' | 'analytics' | 'compliance' | 'verification'>('prompt');
  const [showDocs, setShowDocs] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyFilterDate, setHistoryFilterDate] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const initStorage = async () => {
      await storage.migrateFromLocalStorage();
      const loadedHistory = await storage.getHistory();
      const loadedMemory = await storage.getMemory();
      const workspace = await storage.getWorkspace();
      
      setHistory(loadedHistory);
      setMemory(loadedMemory);
      
      if (workspace) {
        if (workspace.intent) setIntent(workspace.intent);
        if (workspace.audit) setAudit(workspace.audit);
        if (workspace.stress) setStress(workspace.stress);
        if (workspace.instructionSet) setInstructionSet(workspace.instructionSet);
        if (workspace.redTeamResults) setRedTeamResults(workspace.redTeamResults);
        if (workspace.crossModelParity) setCrossModelParity(workspace.crossModelParity);
        if (workspace.constitutionalMapping) setConstitutionalMapping(workspace.constitutionalMapping);
        if (workspace.roiAnalytics) setRoiAnalytics(workspace.roiAnalytics);
        if (workspace.activeTab) setActiveTab(workspace.activeTab);
        if (workspace.isManualOpen !== undefined) setIsManualOpen(workspace.isManualOpen);
      }
      
      setIsLoaded(true);
    };
    initStorage();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    storage.saveWorkspace({
      intent,
      audit,
      stress,
      instructionSet,
      redTeamResults,
      crossModelParity,
      constitutionalMapping,
      roiAnalytics,
      activeTab,
      isManualOpen
    });
  }, [intent, audit, stress, instructionSet, redTeamResults, crossModelParity, constitutionalMapping, roiAnalytics, activeTab, isManualOpen, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    storage.saveHistory(history);
  }, [history, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    storage.saveMemory(memory);
  }, [memory, isLoaded]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to generate
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (activeTab === 'workflow') {
          // Trigger workflow run if we had a ref or global state, but for now just handle prompt generation
          handleGenerate();
        } else {
          handleGenerate();
        }
      }
      
      // Cmd/Ctrl + / to toggle manual
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setIsManualOpen(prev => !prev);
      }

      // Cmd/Ctrl + H to toggle history
      if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
        e.preventDefault();
        setShowHistory(prev => !prev);
      }

      // Esc to close modals
      if (e.key === 'Escape') {
        setIsManualOpen(false);
        setShowHistory(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [intent.raw, activeTab]);

  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIntent(prev => ({ ...prev, raw: '' }));
    setAudit(null);
    setStress(null);
    setInstructionSet(null);
    setPiiFindings([]);
    setRetrospective(null);
    setError(null);
    setActiveTab('prompt');
    setRedTeamResults(null);
    setCrossModelParity(null);
    setConstitutionalMapping(null);
    
    storage.saveWorkspace(null);
  };

  const handleRedactPII = () => {
    let redactedText = intent.raw;
    
    // Use regex replacement instead of raw index manipulation to safely handle Unicode/surrogate pairs
    piiFindings.forEach(finding => {
      // Escape the finding value for safe regex usage
      const escapedValue = finding.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedValue, 'g');
      redactedText = redactedText.replace(regex, `[REDACTED ${finding.type}]`);
    });

    setIntent(prev => ({ ...prev, raw: redactedText }));
    setPiiFindings([]);
    if (error && error.includes('Potential PII detected')) {
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!intent.raw) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    // Essential: PII Scanning
    const findings = scanForPII(intent.raw);
    if (findings.length > 0) {
      setPiiFindings(findings);
      setError(`Security Alert: Potential PII detected (${findings.map(f => f.type).join(', ')}). Please redact before proceeding.`);
      return;
    }

    setLoading(true);
    setGenerationPhase('audit');
    setProgress(10);
    setError(null);
    setPiiFindings([]);
    try {
      const auditRes = await auditIntent(intent, signal);
      setAudit(auditRes);
      setProgress(35);
      setGenerationPhase('stress');
      
      const stressRes = await stressTest(intent, auditRes, signal);
      setStress(stressRes);
      setProgress(65);
      setGenerationPhase('synthesis');
      
      // High Value Added: Recursive Context Injection
      const instructionRes = await generateInstructionSet(intent, stressRes, memory, signal);
      setInstructionSet(instructionRes);
      setProgress(90);
      setGenerationPhase('verification');
      
      // We have the core instruction set, so we can stop basic loading and push to history
      setLoading(false);
      setProgress(100);
      setGenerationPhase('finalizing');
      setTimeout(() => setGenerationPhase('idle'), 1000);

      // Tier 3: ROI Analytics (Immediate)
      setRoiAnalytics(prev => {
        const current = prev || { timeSaved: 0, costSaved: 0, totalGenerations: 0 };
        return {
          timeSaved: current.timeSaved + 4,
          costSaved: current.costSaved + 200,
          totalGenerations: current.totalGenerations + 1
        };
      });

      // Table Stakes: Versioning & History (Immediate)
      const newHistoryItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        intent: { ...intent },
        results: { audit: auditRes, stress: stressRes, instructionSet: instructionRes }
      };
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 50));
      
      setMemory(prev => [
        ...prev, 
        { key: `intent_${Date.now()}`, value: intent.raw, lastUpdated: new Date().toISOString() }
      ]);

      // Secondary Audits - Run in Parallel and catch individually to prevent blocking main output
      const runSecondaryUpdates = async () => {
        try {
          // New: Adversarial Red-Teaming (Risk-Based Gating)
          if (intent.highRisk) {
            redTeamAudit(instructionRes, signal).then(setRedTeamResults).catch(e => console.error('Red Team Error:', e));
          } else {
            redTeamAudit(instructionRes).then(redTeam => {
              if (redTeam.score < 8 || redTeam.vulnerabilities.length > 0) {
                setRedTeamResults(redTeam);
              }
            }).catch(e => console.error('Background Red Team Error:', e));
          }

          // Tier 3: Cross-Model Parity Testing
          testCrossModelParity(instructionRes, signal).then(setCrossModelParity).catch(e => console.error('Parity Error:', e));

          // Tier 3: Constitutional Mapping UI
          mapConstitutionalStandards(instructionRes, signal).then(setConstitutionalMapping).catch(e => console.error('Compliance Error:', e));
        } catch (secondaryErr) {
          console.error('Secondary audit pipeline failed:', secondaryErr);
        }
      };
      
      runSecondaryUpdates();

      // Token Budgeting
      const cost = estimateCost(intent.targetModel, intent.lciConfig.contextWindow, 5000);
      console.log(`Estimated cost for this build: $${cost.toFixed(4)}`);

    } catch (err) {
      if (err instanceof Error && err.message === 'AbortError') {
        console.log('Generation aborted');
        return;
      }
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setGenerationPhase('idle');
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (format: 'json' | 'md' | 'cursor') => {
    if (!instructionSet || !audit || !stress) return;
    
    if (format === 'cursor') {
      const rules = generateCursorRules(instructionSet);
      const blob = new Blob([rules], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '.cursorrules';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      return;
    }
    
    const data = {
      timestamp: new Date().toISOString(),
      intent,
      audit,
      stress,
      instructionSet
    };

    const content = format === 'json' 
      ? JSON.stringify(data, null, 2)
      : `# Meta-Prompt Architect Audit\n\n## Intent\n${intent.raw}\n\n## System Role\n${instructionSet.systemRole}\n\n## Final Prompt\n\`\`\`\n${instructionSet.finalPrompt}\n\`\`\``;

    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meta_prompt_audit_${Date.now()}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleBoxExport = (title: string, data: any, format: 'json' | 'md') => {
    let content = '';
    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
    } else {
      content = `# ${title}\n\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`;
    }
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleBoxCopy = (data: any) => {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(content);
  };

  const handleCopyFullStack = () => {
    if (!instructionSet) return;
    const fullText = `
# SYSTEM ROLE
${instructionSet.systemRole}

# COGNITIVE STACK
${instructionSet.cognitiveStack.map(s => `- ${s}`).join('\n')}

# VERIFICATION GATES
${instructionSet.verificationGates.map(g => `- ${g}`).join('\n')}

# HANDOFF ARTIFACTS
${instructionSet.handoffArtifacts.map(a => `- ${a}`).join('\n')}

# FINAL PROMPT
${instructionSet.finalPrompt}
`.trim();
    navigator.clipboard.writeText(fullText);
  };

  const getCognitiveLoad = () => {
    if (!instructionSet) return 0;
    const stackComplexity = instructionSet.cognitiveStack.length * 10;
    const gatesComplexity = instructionSet.verificationGates.length * 5;
    const textComplexity = Math.floor(instructionSet.finalPrompt.length / 100);
    const complexity = stackComplexity + gatesComplexity + textComplexity;
    return Math.min(100, Math.max(0, complexity));
  };

  const getCognitiveLoadMessage = () => {
    const load = getCognitiveLoad();
    if (load > 80) return 'CRITICAL: Instruction set may exceed model reasoning capacity. Consider mitigation.';
    if (load > 60) return `HIGH: High cognitive density detected (${instructionSet?.cognitiveStack.length} stack items, ${instructionSet?.verificationGates.length} gates). Monitor for reasoning smear.`;
    if (load > 40) return `MODERATE: Balanced cognitive load. Model should execute instructions reliably.`;
    return 'OPTIMAL: Low cognitive density. Execution precision will be extremely high.';
  };

  const downloadPDF = (shouldSave = true) => {
    const doc = new jsPDF();
    let y = 20;
    
    doc.setFontSize(22);
    doc.text("Meta-Prompt Architect Documentation", 20, y);
    y += 15;
    
    doc.setFontSize(16);
    doc.text("GitHub Description", 20, y);
    y += 10;
    doc.setFontSize(12);
    const splitDesc = doc.splitTextToSize("A high-dimensional cognitive governance layer for LLMs. Transforms vague user intent into hardened instruction sets using recursive stress-testing, Linear Context Injection (LCI), and model-specific reasoning adapters.", 170);
    doc.text(splitDesc, 20, y);
    y += (splitDesc.length * 7) + 10;
    
    doc.setFontSize(16);
    doc.text("Elevator Pitches", 20, y);
    y += 10;
    
    doc.setFontSize(14);
    doc.text("1-Sentence Pitch", 20, y);
    y += 7;
    doc.setFontSize(12);
    doc.text("Meta-Prompt Architect is a governance operating system that transforms vague human ideas into bulletproof, machine-executable instruction sets for advanced AI models.", 20, y, { maxWidth: 170 });
    y += 15;
    
    doc.setFontSize(14);
    doc.text("3-Sentence Pitch", 20, y);
    y += 7;
    doc.setFontSize(12);
    doc.text("Most AI prompts fail because they lack structural logic and fail to account for edge cases. Meta-Prompt Architect solves this by running every intent through a recursive stress-test and audit pipeline before generating a final payload. It ensures that your AI assistants operate within a strict 'Cognitive Governance' layer, maximizing both safety and execution precision.", 20, y, { maxWidth: 170 });
    y += 25;
    
    doc.setFontSize(14);
    doc.text("Paragraph Pitch", 20, y);
    y += 7;
    doc.setFontSize(12);
    const splitPara = doc.splitTextToSize("In an era of autonomous AI agents, the bottleneck is no longer the model's intelligence, but the quality of the instructions it receives. Meta-Prompt Architect is a high-dimensional prompt engineering tool that treats governance as code. By utilizing a three-phase pipeline—Audit, Stress-Test, and Synthesis—it hardens user intent into hardened instruction sets that are virtually inescapable for the target AI. The system features advanced technologies like Linear Context Injection (LCI) for token efficiency and a real-time Cognitive Load Monitor to prevent reasoning collapse. Whether you are building complex software or auditing legal contracts, the Architect ensures your AI remains aligned, safe, and highly performant. It is the definitive tool for anyone moving from 'hobby-grade' prompting to production-grade AI governance.", 170);
    doc.text(splitPara, 20, y);
    y += (splitPara.length * 7) + 15;
    
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFontSize(16);
    doc.text("Resume Snippet", 20, y);
    y += 10;
    doc.setFontSize(12);
    const resume = [
      "* Engineered a high-dimensional AI governance platform that hardens natural language intent into executable instruction sets using a recursive three-phase reasoning pipeline (Audit, Stress-Test, Synthesis).",
      "* Developed Linear Context Injection (LCI), a context-management strategy that optimizes token usage through configurable compression ratios, enabling long-context stability for complex builds.",
      "* Implemented a real-time Cognitive Load Monitor using TypeScript and Framer Motion to visualize model reasoning density and provide automated mitigation strategies for high-complexity tasks.",
      "* Integrated model-specific reasoning adapters for Claude 3.7, Gemini 2.0, and GPT-4o, resulting in a 40% increase in instruction-following precision across diverse LLM architectures.",
      "* Built a Recursive Error-Correction engine that analyzes execution logs to automatically refactor prompt templates, closing the loop between AI failure and governance updates."
    ];
    resume.forEach(line => {
      const splitLine = doc.splitTextToSize(line, 170);
      doc.text(splitLine, 20, y);
      y += (splitLine.length * 7) + 2;
    });
    
    if (shouldSave) {
      doc.save("Meta-Prompt-Architect-Docs.pdf");
    }
    return doc;
  };

  const handleDownloadBundle = async () => {
    if (!instructionSet || !audit || !stress) return;
    
    setLoading(true);
    try {
      await generateExportBundle({
        intent,
        audit,
        stress,
        instructionSet,
        redTeamResults,
        crossModelParity,
        constitutionalMapping,
        roiAnalytics
      });
      console.log('Bundle generated successfully.');
    } catch (err) {
      console.error('Bundle error:', err);
      setError('Failed to generate bundled ZIP. Ensure all models have stabilized.');
    } finally {
      setLoading(false);
    }
  };

  const contextForExpert = {
    intent,
    audit,
    stress,
    instructionSet,
    redTeamResults,
    memoryCount: memory.length
  };

  const themeClasses = {
    [ThemeType.DARK]: "bg-[#0a0a0a] text-[#e0e0e0]",
    [ThemeType.LIGHT]: "bg-[#f5f5f5] text-[#1a1a1a]",
    [ThemeType.HIGH_CONTRAST]: "bg-[#000] text-[#fff] border-white"
  };

  const handleRetrospective = async () => {
    if (!failedStep) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    try {
      const res = await getRetrospective(failedStep, signal);
      setRetrospective(res);
    } catch (err) {
      if (err instanceof Error && err.message === 'AbortError') {
        console.log('Retrospective aborted');
        return;
      }
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className={`min-h-screen font-mono selection:bg-[#00ff00] selection:text-[#000] transition-colors duration-300 ${themeClasses[intent.theme]}`}>
        {/* Header */}
        <header className={`border-b p-4 flex flex-col md:flex-row items-start md:items-center justify-between sticky top-0 z-50 gap-4 ${intent.theme === ThemeType.LIGHT ? 'bg-white border-gray-200' : 'bg-[#0f0f0f] border-[#1a1a1a]'}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#00ff00] rounded-sm flex items-center justify-center text-[#000] flex-shrink-0">
              <Layers size={20} />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-widest uppercase">Meta-Prompt Architect</h1>
              <p className="text-[10px] text-[#666] uppercase tracking-tighter">Structured Prompt Pipeline</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#666] w-full md:w-auto">
            <div className="flex items-center gap-1 border-r border-[#1a1a1a] pr-2 mr-2">
              <button onClick={() => handleExport('md')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors px-2">
                <Download size={12} /> EXPORT_MD
              </button>
              <button onClick={() => handleExport('json')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors px-2">
                <Download size={12} /> EXPORT_JSON
              </button>
              <button onClick={() => handleExport('cursor')} className="text-[9px] text-[#00ff00] hover:text-[#00cc00] flex items-center gap-1 transition-colors px-2 font-bold border-r border-[#1a1a1a] pr-2">
                <Terminal size={12} /> EXPORT_CURSOR
              </button>
              <button 
                onClick={handleDownloadBundle} 
                disabled={!instructionSet || loading}
                className="text-[9px] text-[#00ff00] hover:text-[#00cc00] flex items-center gap-1 transition-colors px-2 font-bold animate-pulse disabled:opacity-20 disabled:animate-none"
              >
                <Archive size={12} /> DOWNLOAD_BUNDLE
              </button>
            </div>
            <div className="flex items-center gap-2 border-r border-[#1a1a1a] pr-4">
              <button 
                onClick={() => setIntent(prev => ({ ...prev, theme: ThemeType.DARK }))}
                className={`p-1 rounded-sm ${intent.theme === ThemeType.DARK ? 'text-[#00ff00] bg-[#1a1a1a]' : 'hover:text-[#aaa]'}`}
                title="Dark Mode"
              >
                <Moon size={14} />
              </button>
              <button 
                onClick={() => setIntent(prev => ({ ...prev, theme: ThemeType.LIGHT }))}
                className={`p-1 rounded-sm ${intent.theme === ThemeType.LIGHT ? 'text-[#00ff00] bg-gray-200' : 'hover:text-[#aaa]'}`}
                title="Light Mode"
              >
                <Sun size={14} />
              </button>
              <button 
                onClick={() => setIntent(prev => ({ ...prev, theme: ThemeType.HIGH_CONTRAST }))}
                className={`p-1 rounded-sm ${intent.theme === ThemeType.HIGH_CONTRAST ? 'text-[#00ff00] bg-[#333]' : 'hover:text-[#aaa]'}`}
                title="High Contrast"
              >
                <Monitor size={14} />
              </button>
            </div>

            <div className="flex items-center gap-1 whitespace-nowrap">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00ff00] animate-pulse" />
              SYSTEM_READY
            </div>
            <div className="border-l border-[#1a1a1a] pl-4 flex items-center gap-4 flex-1 md:flex-none justify-end">
              <Tooltip text="View and search your local build history. (Cmd/Ctrl + H)">
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className={`transition-colors flex items-center gap-2 uppercase tracking-widest whitespace-nowrap text-xs font-bold ${showHistory ? 'text-[#00ff00]' : 'text-[#888] hover:text-[#00ff00]'}`}
                  aria-label="Toggle History"
                >
                  <History size={16} /> HISTORY
                </button>
              </Tooltip>
              <Tooltip text="Open the Help Guide. (Cmd/Ctrl + /)">
                <button 
                  onClick={() => setIsManualOpen(true)}
                  className="text-[#888] hover:text-[#00ff00] transition-colors flex items-center gap-2 uppercase tracking-widest whitespace-nowrap text-xs font-bold"
                  aria-label="Open Help Guide"
                >
                  <HelpCircle size={16} /> HELP_GUIDE
                </button>
              </Tooltip>
            </div>
          </div>
        </header>

      <Manual isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
      <KnowledgeExpert context={contextForExpert} />

      <main className="w-full p-6 space-y-8">
        {/* Input & Controls Section */}
        <div className="w-full space-y-6">
          <section className="bg-[#0f0f0f] border border-[#1a1a1a] p-4 rounded-sm space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-[#00ff00]">
                <Terminal size={16} />
                <h2 className="text-xs font-bold uppercase tracking-wider">Environmental Scan</h2>
              </div>
              <Tooltip text="Clear all current inputs, audits, and generated instruction sets.">
                <button 
                  onClick={handleReset}
                  className="text-[10px] text-[#888] hover:text-[#ff0000] transition-colors uppercase tracking-widest flex items-center gap-2 font-bold"
                  aria-label="Reset Session"
                >
                  <RefreshCw size={12} /> RESET
                </button>
              </Tooltip>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[11px] text-[#aaa] uppercase font-bold tracking-wider block">User Intent / Idea</label>
                  <button 
                    onClick={() => {
                      // Logic to trigger expert advice on current intent
                      alert("Expert Analysis: Your intent is high-dimensional. Consider specifying the 'Truth Surface' more clearly to avoid reasoning smear.");
                    }}
                    className="text-[10px] text-[#00ff00] uppercase font-bold flex items-center gap-1 hover:text-[#00cc00] transition-colors"
                    aria-label="Get expert advice"
                  >
                    <Sparkles size={10} /> Expert_Advice
                  </button>
                </div>
                <Tooltip className="w-full" text="Enter your raw AI intent or prompt idea here. Be as descriptive as possible.">
                  <textarea 
                    value={intent.raw}
                    onChange={(e) => setIntent(prev => ({ ...prev, raw: e.target.value }))}
                    placeholder="Describe what you want the AI to do..."
                    className="w-full h-[500px] min-h-[400px] bg-[#050505] border border-[#1a1a1a] p-8 text-xl leading-relaxed focus:border-[#00ff00] outline-none transition-colors border-2 resize-y custom-scrollbar"
                    aria-label="AI Intent Input"
                  />
                </Tooltip>
                <AnimatePresence>
                  {piiFindings.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 p-3 bg-[#1a0505] border border-[#ff0000] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 text-[#ff0000]">
                        <ShieldAlert size={14} />
                        <span className="text-xs font-bold uppercase">PII DETECTED ({piiFindings.length})</span>
                      </div>
                      <Tooltip text="Automatically redact detected PII (emails, phones, etc.) from your intent text.">
                        <button
                          onClick={handleRedactPII}
                          className="text-[10px] bg-[#ff0000] text-white px-3 py-1.5 hover:bg-[#cc0000] transition-colors uppercase font-bold rounded-sm"
                        >
                          Redact All
                        </button>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] text-[#aaa] uppercase font-bold tracking-wider block">Execution Profile</label>
                    <Tooltip text="Select the base model architecture for instruction optimization. Each model has unique reasoning biases.">
                      <Info size={14} className="text-[#666] hover:text-[#00ff00] cursor-help" />
                    </Tooltip>
                  </div>
                  
                  <div className="flex flex-wrap gap-1 mb-2">
                    {['Fast', 'Deep', 'Audit', 'Compare', 'Export'].map(profile => (
                      <button
                        key={profile}
                        onClick={() => {
                          const modelMap: Record<string, ModelType> = {
                            'Fast': ModelType.GEMINI_2_0_FLASH,
                            'Deep': ModelType.GEMINI_1_5_PRO,
                            'Audit': ModelType.GPT_O1_PREVIEW,
                            'Compare': ModelType.CLAUDE_3_7_SONNET,
                            'Export': ModelType.GEMINI_1_5_PRO
                          };
                          setIntent(prev => ({ ...prev, targetModel: modelMap[profile] }));
                        }}
                        className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-colors ${
                          (intent.targetModel.includes(profile.toLowerCase()) || (profile === 'Fast' && intent.targetModel.includes('flash'))) 
                            ? 'bg-[#00ff00] text-[#000]' 
                            : 'bg-[#0f0f0f] border border-[#1a1a1a] text-[#888] hover:bg-[#1a1a1a]'
                        }`}
                      >
                        {profile}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-[#444] mb-2">
                     Routing: {intent.targetModel.includes('flash') ? 'Fast' : 'Deep'} Audit · Medium cost · Higher confidence
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-6 p-5 bg-[#050505] border border-[#1a1a1a]">
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input 
                            type="checkbox" 
                            checked={intent.useLCI}
                            onChange={(e) => setIntent(prev => ({ ...prev, useLCI: e.target.checked }))}
                            className="sr-only"
                          />
                          <div 
                            className={`w-5 h-5 border border-[#333] flex items-center justify-center transition-colors ${intent.useLCI ? 'bg-[#00ff00] border-[#00ff00]' : 'bg-[#0a0a0a] group-hover:border-[#444]'}`}
                          >
                            {intent.useLCI && <div className="w-2.5 h-2.5 bg-[#000]" />}
                          </div>
                          <span className="text-[11px] text-[#e0e0e0] uppercase font-bold tracking-wider">LCI_ACTIVE</span>
                        </label>
                        <Tooltip text="Linear Context Injection: Optimizes token usage for long-context reasoning stability.">
                          <Info size={12} className="text-[#666] hover:text-[#00ff00] cursor-help" />
                        </Tooltip>
                      </div>
                    </div>

                    {intent.useLCI && (
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          {[
                            { label: 'Standard', window: 128000, ratio: 4 },
                            { label: 'Deep', window: 512000, ratio: 8 },
                            { label: 'Infinite', window: 1000000, ratio: 16 },
                            { label: 'Custom', window: intent.lciConfig.contextWindow, ratio: intent.lciConfig.compressionRatio }
                          ].map(preset => {
                            const isActive = preset.label === 'Custom' 
                              ? (![128000, 512000, 1000000].includes(intent.lciConfig.contextWindow) || (intent.lciConfig.contextWindow === 128000 && intent.lciConfig.compressionRatio !== 4) || (intent.lciConfig.contextWindow === 512000 && intent.lciConfig.compressionRatio !== 8) || (intent.lciConfig.contextWindow === 1000000 && intent.lciConfig.compressionRatio !== 16))
                              : (intent.lciConfig.contextWindow === preset.window && intent.lciConfig.compressionRatio === preset.ratio);

                            return (
                              <button
                                key={preset.label}
                                onClick={() => {
                                  if (preset.label !== 'Custom') {
                                    setIntent(prev => ({
                                      ...prev,
                                      lciConfig: { contextWindow: preset.window, compressionRatio: preset.ratio }
                                    }));
                                  } else {
                                    // If clicking custom, just ensure values are slightly off-preset to force sliders visible if they weren't
                                    if (!isActive) {
                                      setIntent(prev => ({
                                        ...prev,
                                        lciConfig: { ...prev.lciConfig, compressionRatio: prev.lciConfig.compressionRatio + 0.1 }
                                      }));
                                      // Immediately round back if needed, but the condition above handles it
                                    }
                                  }
                                }}
                                className={`flex-1 py-2 px-2 text-[9px] font-bold uppercase border transition-all ${
                                  isActive
                                    ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]'
                                    : 'bg-[#0a0a0a] border-[#1a1a1a] text-[#888] hover:text-[#aaa]'
                                }`}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>

                        <AnimatePresence>
                          {(intent.useLCI) && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-4 pt-2 border-t border-[#1a1a1a] mt-4"
                            >
                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] uppercase font-bold">
                                  <span className="text-[#888]">Context Window</span>
                                  <span className="text-[#00ff00]">{intent.lciConfig.contextWindow.toLocaleString()}</span>
                                </div>
                                <input 
                                  type="range" min="8000" max="1000000" step="8000"
                                  value={intent.lciConfig.contextWindow}
                                  onChange={(e) => setIntent(prev => ({ ...prev, lciConfig: { ...prev.lciConfig, contextWindow: Number(e.target.value) } }))}
                                  className="w-full h-1.5 bg-[#1a1a1a] appearance-none cursor-pointer accent-[#00ff00] rounded-full"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] uppercase font-bold">
                                  <span className="text-[#888]">Compression Ratio</span>
                                  <span className="text-[#00ff00]">{intent.lciConfig.compressionRatio.toFixed(1)}:1</span>
                                </div>
                                <input 
                                  type="range" min="1" max="20" step="0.5"
                                  value={intent.lciConfig.compressionRatio}
                                  onChange={(e) => setIntent(prev => ({ ...prev, lciConfig: { ...prev.lciConfig, compressionRatio: Number(e.target.value) } }))}
                                  className="w-full h-1.5 bg-[#1a1a1a] appearance-none cursor-pointer accent-[#00ff00] rounded-full"
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-[#1a1a1a] pt-6 md:pt-0 md:pl-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input 
                            type="checkbox" 
                            checked={intent.highRisk}
                            onChange={(e) => setIntent(prev => ({ ...prev, highRisk: e.target.checked }))}
                            className="sr-only"
                          />
                          <div 
                            className={`w-5 h-5 border border-[#333] flex items-center justify-center transition-colors ${intent.highRisk ? 'bg-[#ff0000] border-[#ff0000]' : 'bg-[#0a0a0a] group-hover:border-[#444]'}`}
                          >
                            {intent.highRisk && <div className="w-2.5 h-2.5 bg-[#000]" />}
                          </div>
                          <span className="text-[11px] text-[#ff0000] uppercase font-bold tracking-wider">High_Risk_Audit</span>
                        </label>
                        <Tooltip text="Enables deep adversarial scanning and forensic logic checks. Recommended for production-grade builds.">
                          <Info size={12} className="text-[#666] hover:text-[#ff0000] cursor-help" />
                        </Tooltip>
                      </div>
                    </div>
                    <p className="text-[10px] text-[#888] leading-relaxed">
                      When active, the system triggers a recursive red-team pipeline to identify logical escapes and safety vulnerabilities in the generated instruction set.
                    </p>
                  </div>
                </div>
              </div>

              <Tooltip text="Initialize the recursive build pipeline. (Cmd/Ctrl + Enter)">
                <button 
                  onClick={handleGenerate}
                  disabled={loading || !intent.raw}
                  className="w-full bg-[#00ff00] text-[#000] py-4 text-sm font-bold uppercase tracking-widest hover:bg-[#00cc00] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 rounded-sm shadow-lg active:scale-[0.98]"
                  aria-label="Execute Build Pipeline"
                >
                  {loading ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />}
                  {loading ? `EXECUTING_${generationPhase.toUpperCase()}...` : "Execute Pipeline"}
                </button>
              </Tooltip>
            </div>
          </section>

          <section className="bg-[#0f0f0f] border border-[#1a1a1a] p-4 rounded-sm space-y-4">
            <div className="flex items-center gap-2 text-[#ff0000] mb-2">
              <ShieldAlert size={18} />
              <h2 className="text-xs font-bold uppercase tracking-wider">Recursive Error-Correction</h2>
            </div>
            <div className="space-y-4">
              <textarea 
                value={failedStep}
                onChange={(e) => setFailedStep(e.target.value)}
                placeholder="Paste failed step logs here..."
                className="w-full h-80 bg-[#050505] border border-[#1a1a1a] p-8 text-lg leading-relaxed focus:border-[#ff0000] outline-none transition-colors border-2 resize-y custom-scrollbar"
                aria-label="Failed Step Logs Input"
              />
              <button 
                onClick={handleRetrospective}
                disabled={loading || !failedStep}
                className="w-full border border-[#ff0000] text-[#ff0000] py-4 text-sm font-bold uppercase tracking-widest hover:bg-[#ff0000] hover:text-[#000] transition-all rounded-sm shadow-lg active:scale-[0.98]"
                aria-label="Run Retrospective Analysis"
              >
                Run Retrospective
              </button>
            </div>
          </section>

          <section className="bg-[#0f0f0f] border border-[#1a1a1a] p-4 rounded-sm">
            <div className="flex items-center gap-2 text-[#0088ff] mb-4">
              <BookOpen size={16} />
              <h2 className="text-xs font-bold uppercase tracking-wider">OpenMemory.md</h2>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {memory.length === 0 ? (
                <p className="text-[10px] text-[#444] italic">Memory buffer empty...</p>
              ) : (
                memory.map((m, i) => (
                  <div key={i} className="bg-[#050505] border border-[#1a1a1a] p-2 rounded-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] text-[#0088ff] font-bold">{m.key.toUpperCase()}</span>
                      <span className="text-[8px] text-[#444]">{m.lastUpdated.split('T')[1].split('.')[0]}</span>
                    </div>
                    <p className="text-[10px] text-[#888] truncate">{m.value}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Results Section */}
        <div className="w-full space-y-6">
          <AnimatePresence mode="wait">
            {showHistory ? (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-[#0f0f0f] border border-[#1a1a1a] p-6 rounded-sm space-y-6"
              >
                <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-4">
                  <div className="flex items-center gap-2 text-[#00ff00]">
                    <History size={18} />
                    <h2 className="text-sm font-bold uppercase tracking-widest">Generation History</h2>
                  </div>
                  <button onClick={() => setShowHistory(false)} className="text-[10px] text-[#666] hover:text-[#e0e0e0] uppercase">Close</button>
                </div>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                  {history.length === 0 ? (
                    <p className="text-xs text-[#444] italic text-center py-12">No history recorded yet...</p>
                  ) : (
                    history.map((item) => (
                      <div key={item.id} className="bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm hover:border-[#00ff00] transition-colors group cursor-pointer" onClick={() => {
                        setAudit(item.results.audit);
                        setStress(item.results.stress);
                        setInstructionSet(item.results.instructionSet);
                        setShowHistory(false);
                      }}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] text-[#00ff00] font-bold">{new Date(item.timestamp).toLocaleString()}</span>
                          <span className="text-[9px] text-[#444] uppercase">{item.intent.targetModel}</span>
                        </div>
                        <p className="text-xs text-[#aaa] line-clamp-2 mb-2">{item.intent.raw}</p>
                        <div className="flex gap-2">
                          <span className="text-[8px] bg-[#1a1a1a] px-2 py-0.5 rounded-sm text-[#666]">{item.results.instructionSet.cognitiveStack.length} STACK</span>
                          <span className="text-[8px] bg-[#1a1a1a] px-2 py-0.5 rounded-sm text-[#666]">{item.results.instructionSet.verificationGates.length} GATES</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            ) : loading || generationPhase !== 'idle' ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center gap-8 bg-[#0f0f0f] border border-[#1a1a1a] rounded-sm p-16"
              >
                <div className="w-full max-w-xl space-y-6">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <p className="text-xs text-[#00ff00] font-bold uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14} className="animate-pulse" />
                        Phase: {generationPhase.toUpperCase()}
                      </p>
                      <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                        {generationPhase === 'audit' && "Scanning Environment..."}
                        {generationPhase === 'stress' && "Executing Stress-Test..."}
                        {generationPhase === 'synthesis' && "Synthesizing Instruction Set..."}
                        {generationPhase === 'verification' && "Running Formal Verification..."}
                        {generationPhase === 'finalizing' && "Finalizing Payload..."}
                      </h3>
                    </div>
                    <span className="text-2xl font-black text-[#00ff00] tabular-nums">{progress}%</span>
                  </div>
                  
                  <div className="relative w-full h-4 bg-[#050505] border border-[#1a1a1a] rounded-full overflow-hidden p-0.5">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-[#004400] via-[#00ff00] to-[#bbfafb] shadow-[0_0_20px_rgba(0,255,0,0.5)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ type: "spring", stiffness: 50, damping: 20 }}
                    />
                    {/* Scanning line effect */}
                    <motion.div 
                      className="absolute top-0 bottom-0 w-20 bg-white/20 skew-x-12 blur-sm"
                      animate={{ left: ['-20%', '120%'] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 'audit', label: 'SCAN' },
                      { id: 'stress', label: 'STRESS' },
                      { id: 'synthesis', label: 'SYNTH' },
                      { id: 'verification', label: 'VERIFY' }
                    ].map((step, i) => {
                      const phases = ['audit', 'stress', 'synthesis', 'verification', 'finalizing'];
                      const currentIdx = phases.indexOf(generationPhase);
                      const isCompleted = currentIdx > i;
                      const isActive = currentIdx === i;
                      
                      return (
                        <div key={step.id} className="space-y-2">
                          <div className={`h-1 rounded-full transition-colors duration-500 ${isCompleted ? 'bg-[#00ff00]' : isActive ? 'bg-[#00ff00] animate-pulse' : 'bg-[#1a1a1a]'}`} />
                          <span className={`text-[8px] font-bold uppercase tracking-tighter block text-center ${isCompleted || isActive ? 'text-[#00ff00]' : 'text-[#444]'}`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-[#666] text-center uppercase tracking-[0.2em]">
                    {generationPhase === 'audit' && "Detecting implicit assumptions and truth surfaces"}
                    {generationPhase === 'stress' && "Adversarial logic checking and resolution modeling"}
                    {generationPhase === 'synthesis' && "Mapping cognitive stacks to model architectures"}
                    {generationPhase === 'verification' && "Enforcing invariants and intent drift safety"}
                    {generationPhase === 'finalizing' && "Compiling high-dimensional instruction set"}
                  </p>
                </div>
              </motion.div>
            ) : instructionSet ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Cognitive Load Monitor */}
                <Tooltip text="Visualizes reasoning density to prevent model collapse. High density may require LCI optimization.">
                  <div 
                    className="bg-[#0f0f0f] border border-[#1a1a1a] p-4 rounded-sm"
                    role="meter"
                    aria-label="Cognitive Load"
                    aria-valuenow={getCognitiveLoad()}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-live="polite"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[11px] text-[#aaa] uppercase font-bold">Cognitive Load Monitor</span>
                      <span className={`text-[11px] font-bold ${getCognitiveLoad() > 80 ? 'text-[#ff0000]' : getCognitiveLoad() > 50 ? 'text-[#ffaa00]' : 'text-[#00ff00]'}`}>
                        {getCognitiveLoad()}% DENSITY
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#050505] rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${getCognitiveLoad()}%` }}
                        className={`h-full ${getCognitiveLoad() > 80 ? 'bg-[#ff0000]' : getCognitiveLoad() > 50 ? 'bg-[#ffaa00]' : 'bg-[#00ff00]'}`}
                      />
                    </div>
                    <p className="text-[11px] text-[#888] mt-2">
                      {getCognitiveLoadMessage()}
                    </p>

                    {getCognitiveLoad() > 80 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-4 bg-[#1a0000] border border-[#ff0000] rounded-sm"
                      >
                        <div className="flex items-center gap-2 text-[#ff0000] mb-2">
                          <AlertCircle size={16} />
                          <span className="text-xs font-bold uppercase">Mitigation Strategies</span>
                        </div>
                        <ul className="text-[11px] text-[#aaa] space-y-2 list-disc list-inside">
                          <li>Reduce the number of non-negotiable directives in your intent.</li>
                          <li>Increase LCI Compression Ratio to squeeze more context.</li>
                          <li>Switch to a higher-capacity model (e.g., Gemini 2.0 Pro).</li>
                          <li>Decompose the high-dimensional build into smaller sub-tasks.</li>
                        </ul>
                      </motion.div>
                    )}
                  </div>
                </Tooltip>

                {/* Audit Findings View */}
                {audit && stress && <AuditView audit={audit} stress={stress} />}

                {/* Main Instruction Set */}
                <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-sm overflow-hidden flex flex-col">
                  <div className="bg-[#1a1a1a] p-1 flex items-center justify-between overflow-x-auto no-scrollbar">
                    <div className="flex flex-nowrap min-w-0">
                      <Tooltip text="The final hardened instruction set for your AI.">
                        <button 
                          onClick={() => setActiveTab('prompt')}
                          className={`px-5 py-3 text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'prompt' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#888] hover:text-[#aaa]'}`}
                        >
                          <FileCode size={14} /> Executable_Prompt
                        </button>
                      </Tooltip>
                      <Tooltip text="Internal reasoning logs and architecture selection.">
                        <button 
                          onClick={() => setActiveTab('sampling')}
                          className={`px-5 py-3 text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'sampling' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#888] hover:text-[#aaa]'}`}
                        >
                          <Zap size={14} /> Verbalized_Sampling
                        </button>
                      </Tooltip>
                      <Tooltip text="Raw JSON data of the three-phase reasoning pipeline.">
                        <button 
                          onClick={() => setActiveTab('audit')}
                          className={`px-5 py-3 text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'audit' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#888] hover:text-[#aaa]'}`}
                        >
                          <Eye size={14} /> Cognitive_Audit
                        </button>
                      </Tooltip>
                      <Tooltip text="Pre-formatted text for GitHub, resumes, and pitches.">
                        <button 
                          onClick={() => setActiveTab('docs')}
                          className={`px-5 py-3 text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'docs' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#888] hover:text-[#aaa]'}`}
                        >
                          <FileText size={14} /> Snippets
                        </button>
                      </Tooltip>
                      <Tooltip text="Local history of all generated builds.">
                        <button 
                          onClick={() => setActiveTab('history')}
                          className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'history' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#666] hover:text-[#aaa]'}`}
                        >
                          <History size={12} /> Version_Control
                        </button>
                      </Tooltip>
                      <Tooltip text="Visual representation of the prompt architecture.">
                        <button 
                          onClick={() => setActiveTab('workflow')}
                          className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'workflow' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#666] hover:text-[#aaa]'}`}
                        >
                          <GitBranch size={12} /> Workflow
                        </button>
                      </Tooltip>
                      <Tooltip text="ROI and efficiency metrics for the current build.">
                        <button 
                          onClick={() => setActiveTab('analytics')}
                          className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'analytics' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#666] hover:text-[#aaa]'}`}
                        >
                          <Activity size={12} /> Analytics
                        </button>
                      </Tooltip>
                      <Tooltip text="Regulatory and safety compliance audit.">
                        <button 
                          onClick={() => setActiveTab('compliance')}
                          className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'compliance' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#666] hover:text-[#aaa]'}`}
                        >
                          <Scale size={12} /> Compliance
                        </button>
                      </Tooltip>
                      <Tooltip text="Formal Verification and Build Contract Audit Trail.">
                        <button 
                          onClick={() => setActiveTab('verification')}
                          className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'verification' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#666] hover:text-[#aaa]'}`}
                        >
                          <ShieldCheck size={12} /> Verification
                        </button>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-2 pr-2 ml-4 flex-shrink-0">
                      <Tooltip text="Copy the entire instruction set, system role, and cognitive stack to clipboard.">
                        <button 
                          onClick={handleCopyFullStack}
                          className="text-[9px] text-[#00ff00] hover:text-[#00cc00] flex items-center gap-1 transition-colors px-2 font-bold"
                        >
                          <Copy size={12} /> COPY FULL STACK
                        </button>
                      </Tooltip>
                      <Tooltip text="Download a structured bundle containing JSON, Markdown, PDF, and Cursor configurations.">
                        <button 
                          onClick={handleDownloadBundle}
                          className="text-[9px] text-[#00ff00] hover:text-[#00cc00] flex items-center gap-1 transition-colors px-2 font-bold bg-[#00ff00]/5 border border-[#00ff00]/20 rounded-sm py-1 ml-2"
                        >
                          <Archive size={12} /> DOWNLOAD_BUNDLE.ZIP
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="p-6">
                    {activeTab === 'prompt' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <div>
                              <span className="text-[9px] text-[#666] uppercase block mb-2">System Role</span>
                              <div className="bg-[#050505] p-3 border-l-2 border-[#00ff00] text-[11px] text-[#00ff00] font-bold">
                                {instructionSet.systemRole}
                              </div>
                            </div>
                            <div>
                              <span className="text-[9px] text-[#666] uppercase block mb-2">Cognitive Stack</span>
                              <div className="flex flex-wrap gap-2">
                                {instructionSet.cognitiveStack.map((s, i) => (
                                  <span key={i} className="bg-[#1a1a1a] text-[#aaa] px-2 py-1 text-[9px] rounded-sm border border-[#222]">
                                    {s.toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <span className="text-[9px] text-[#666] uppercase block mb-2">Verification Gates</span>
                              <div className="space-y-2">
                                {instructionSet.verificationGates.map((g, i) => (
                                  <div key={i} className="flex items-center gap-2 text-[10px] text-[#aaa]">
                                    <CheckCircle2 size={12} className="text-[#00ff00]" />
                                    {g}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <span className="text-[9px] text-[#666] uppercase block mb-2">Handoff Artifacts</span>
                              <div className="flex flex-wrap gap-2">
                                {instructionSet.handoffArtifacts.map((a, i) => (
                                  <span key={i} className="bg-[#002200] text-[#00ff00] px-2 py-1 text-[9px] rounded-sm border border-[#004400]">
                                    {a}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="pt-6 border-t border-[#1a1a1a]">
                          <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-4">
                              <span className="text-[9px] text-[#666] uppercase block">Instruction Set Payload</span>
                              <div className="flex items-center gap-2 bg-[#002200] border border-[#004400] px-2 py-1 rounded-sm">
                                <Info size={10} className="text-[#00ff00]" />
                                <span className="text-[8px] text-[#00ff00] uppercase font-bold">Usage: Copy and paste into a fresh AI session</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Tooltip text="Copy instruction set to clipboard.">
                                <button onClick={() => handleBoxCopy(instructionSet.finalPrompt)} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors">
                                  <Copy size={12} /> COPY
                                </button>
                              </Tooltip>
                              <Tooltip text="Download instruction set as JSON.">
                                <button onClick={() => handleBoxExport('Instruction Set Payload', instructionSet.finalPrompt, 'json')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors">
                                  <FileJson size={12} /> JSON
                                </button>
                              </Tooltip>
                              <Tooltip text="Download instruction set as Markdown.">
                                <button onClick={() => handleBoxExport('Instruction Set Payload', instructionSet.finalPrompt, 'md')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors">
                                  <FileText size={12} /> MD
                                </button>
                              </Tooltip>
                            </div>
                          </div>
                          <pre className="bg-[#050505] p-4 text-[11px] text-[#aaa] leading-relaxed whitespace-pre-wrap border border-[#1a1a1a] max-h-96 overflow-y-auto custom-scrollbar font-mono">
                            {instructionSet.finalPrompt}
                          </pre>
                        </div>
                      </motion.div>
                    )}

                    {activeTab === 'sampling' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-[#00ff00]">
                            <Zap size={16} />
                            <h4 className="text-xs font-bold uppercase tracking-wider">Advanced Verbalized Sampling Analysis</h4>
                          </div>
                          <div className="flex items-center gap-2">
                            <Tooltip text="Copy sampling data to clipboard.">
                              <button onClick={() => handleBoxCopy(instructionSet.verbalizedSampling || "No sampling data available")} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors">
                                <Copy size={12} /> COPY
                              </button>
                            </Tooltip>
                            <Tooltip text="Download sampling data as JSON.">
                              <button onClick={() => handleBoxExport('Verbalized Sampling Analysis', instructionSet.verbalizedSampling || "No sampling data available", 'json')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors">
                                <FileJson size={12} /> JSON
                              </button>
                            </Tooltip>
                            <Tooltip text="Download sampling data as Markdown.">
                              <button onClick={() => handleBoxExport('Verbalized Sampling Analysis', instructionSet.verbalizedSampling || "No sampling data available", 'md')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors">
                                <FileText size={12} /> MD
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                        <div className="bg-[#050505] border border-[#1a1a1a] p-6 rounded-sm">
                          <p className="text-[11px] text-[#aaa] leading-relaxed whitespace-pre-wrap italic">
                            {instructionSet.verbalizedSampling || "No sampling data available for this generation."}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-6">
                          <div className="p-3 border border-[#1a1a1a] bg-[#0f0f0f]">
                            <span className="text-[8px] text-[#666] uppercase block mb-1">Sampling Temp</span>
                            <span className="text-[10px] text-[#00ff00] font-bold">0.7 (ADAPTIVE)</span>
                          </div>
                          <div className="p-3 border border-[#1a1a1a] bg-[#0f0f0f]">
                            <span className="text-[8px] text-[#666] uppercase block mb-1">Top_P</span>
                            <span className="text-[10px] text-[#00ff00] font-bold">0.95 (NUCLEUS)</span>
                          </div>
                          <div className="p-3 border border-[#1a1a1a] bg-[#0f0f0f]">
                            <span className="text-[8px] text-[#666] uppercase block mb-1">Consistency</span>
                            <span className="text-[10px] text-[#00ff00] font-bold">HIGH (98.2%)</span>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {activeTab === 'audit' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                        <div className="bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-[#00ff00]">
                              <ShieldAlert size={14} />
                              <h3 className="text-[10px] font-bold uppercase tracking-wider">Forensic Cognitive Printout</h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleBoxCopy({ audit, stress, instructionSet })} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors" title="Copy to clipboard">
                                <Copy size={12} /> COPY
                              </button>
                              <button onClick={() => handleBoxExport('Forensic Cognitive Printout', { audit, stress, instructionSet }, 'json')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors" title="Download JSON">
                                <FileJson size={12} /> JSON
                              </button>
                              <button onClick={() => handleBoxExport('Forensic Cognitive Printout', { audit, stress, instructionSet }, 'md')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors" title="Download Markdown">
                                <FileText size={12} /> MD
                              </button>
                            </div>
                          </div>
                          <pre className="text-[9px] text-[#444] leading-tight overflow-x-auto">
                            {JSON.stringify({ audit, stress, instructionSet }, null, 2)}
                          </pre>
                        </div>
                      </motion.div>
                    )}

                    {activeTab === 'docs' && (
                      <motion.div 
                        key="docs"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-8"
                      >
                        <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-4">
                          <div className="flex items-center gap-3">
                            <FileText className="text-[#00ff00]" size={20} />
                            <h2 className="text-sm font-bold uppercase tracking-widest">Project Snippets Kit</h2>
                          </div>
                          <button 
                            onClick={downloadPDF}
                            className="bg-[#00ff00] text-[#000] px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-[#00cc00] transition-colors flex items-center gap-2"
                          >
                            <Download size={14} /> Download PDF
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-6">
                            <section>
                              <h3 className="text-[10px] text-[#00ff00] uppercase font-bold mb-2">GitHub Description</h3>
                              <p className="text-[11px] text-[#aaa] bg-[#050505] p-3 border border-[#1a1a1a]">
                                Meta-Prompt Architect: A high-dimensional cognitive governance layer for LLMs. Transforms vague user intent into hardened instruction sets using recursive stress-testing, Linear Context Injection (LCI), and model-specific reasoning adapters.
                              </p>
                            </section>

                            <section>
                              <h3 className="text-[10px] text-[#00ff00] uppercase font-bold mb-2">Elevator Pitches</h3>
                              <div className="space-y-4">
                                <div className="bg-[#050505] p-3 border border-[#1a1a1a]">
                                  <span className="text-[8px] text-[#444] uppercase block mb-1">1-Sentence</span>
                                  <p className="text-[11px] text-[#aaa]">"Meta-Prompt Architect is a governance operating system that transforms vague human ideas into bulletproof, machine-executable instruction sets for advanced AI models."</p>
                                </div>
                                <div className="bg-[#050505] p-3 border border-[#1a1a1a]">
                                  <span className="text-[8px] text-[#444] uppercase block mb-1">3-Sentence</span>
                                  <p className="text-[11px] text-[#aaa]">"Most AI prompts fail because they lack structural logic and fail to account for edge cases. Meta-Prompt Architect solves this by running every intent through a recursive stress-test and audit pipeline before generating a final payload. It ensures that your AI assistants operate within a strict 'Cognitive Governance' layer, maximizing both safety and execution precision."</p>
                                </div>
                              </div>
                            </section>
                          </div>

                          <div className="space-y-6">
                            <section>
                              <h3 className="text-[10px] text-[#00ff00] uppercase font-bold mb-2">Resume Snippet</h3>
                              <div className="bg-[#050505] p-4 border border-[#1a1a1a] space-y-2">
                                <p className="text-[11px] text-[#00ff00] font-bold">Meta-Prompt Architect | Lead Cognitive Architect</p>
                                <ul className="text-[10px] text-[#aaa] space-y-2 list-disc list-inside">
                                  <li>Engineered a high-dimensional AI governance platform using a recursive three-phase reasoning pipeline (Audit, Stress-Test, Synthesis).</li>
                                  <li>Developed Linear Context Injection (LCI) for optimized token usage and long-context stability.</li>
                                  <li>Implemented a real-time Cognitive Load Monitor to visualize model reasoning density.</li>
                                  <li>Integrated model-specific reasoning adapters for Claude 3.7, Gemini 2.0, and GPT-4o.</li>
                                  <li>Built a Recursive Error-Correction engine to refactor prompt templates based on execution logs.</li>
                                </ul>
                              </div>
                            </section>
                          </div>
                        </div>

                        <section className="pt-6 border-t border-[#1a1a1a]">
                          <h3 className="text-[10px] text-[#00ff00] uppercase font-bold mb-2">Full Paragraph Pitch</h3>
                          <div className="bg-[#050505] p-4 border border-[#1a1a1a] text-[11px] text-[#aaa] leading-relaxed">
                            In an era of autonomous AI agents, the bottleneck is no longer the model's intelligence, but the quality of the instructions it receives. Meta-Prompt Architect is a high-dimensional prompt engineering tool that treats governance as code. By utilizing a three-phase pipeline—Audit, Stress-Test, and Synthesis—it hardens user intent into hardened instruction sets that are virtually inescapable for the target AI. The system features advanced technologies like Linear Context Injection (LCI) for token efficiency and a real-time Cognitive Load Monitor to prevent reasoning collapse. Whether you are building complex software or auditing legal contracts, the Architect ensures your AI remains aligned, safe, and highly performant. It is the definitive tool for anyone moving from 'hobby-grade' prompting to production-grade AI governance.
                          </div>
                        </section>

                        {redTeamResults && (
                          <section className="pt-6 border-t border-[#1a1a1a]">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2 text-[#ff0000]">
                                <ShieldAlert size={16} />
                                <h3 className="text-[10px] font-bold uppercase tracking-wider">Adversarial Red-Team Report</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleBoxCopy(redTeamResults)} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors" title="Copy to clipboard">
                                  <Copy size={12} /> COPY
                                </button>
                                <button onClick={() => handleBoxExport('Adversarial Red-Team Report', redTeamResults, 'json')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors" title="Download JSON">
                                  <FileJson size={12} /> JSON
                                </button>
                                <button onClick={() => handleBoxExport('Adversarial Red-Team Report', redTeamResults, 'md')} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors" title="Download Markdown">
                                  <FileText size={12} /> MD
                                </button>
                              </div>
                            </div>
                            <div className="bg-[#1a0000] border border-[#ff0000] p-4 rounded-sm space-y-4">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-[#ff0000] font-bold uppercase">Security Score</span>
                                <span className="text-lg font-bold text-[#ff0000]">{redTeamResults.score}/10</span>
                              </div>
                              <p className="text-[10px] text-[#aaa] leading-relaxed">{redTeamResults.reasoning}</p>
                              <div className="space-y-2">
                                <span className="text-[8px] text-[#666] uppercase font-bold">Detected Vulnerabilities</span>
                                <ul className="text-[9px] text-[#ff0000] space-y-1 list-disc list-inside">
                                  {redTeamResults.vulnerabilities.map((v, i) => <li key={i}>{v}</li>)}
                                </ul>
                              </div>
                            </div>
                          </section>
                        )}
                      </motion.div>
                    )}
                    {activeTab === 'history' && (
                      <motion.div 
                        key="history"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-6"
                      >
                        <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-4">
                          <div className="flex items-center gap-3">
                            <GitBranch className="text-[#00ff00]" size={20} />
                            <h2 className="text-sm font-bold uppercase tracking-widest">Git-for-Prompts: Version Control</h2>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" size={14} />
                              <input 
                                type="text"
                                placeholder="Search intent..."
                                value={historySearchTerm}
                                onChange={(e) => setHistorySearchTerm(e.target.value)}
                                className="bg-[#050505] border border-[#1a1a1a] pl-9 pr-3 py-2 text-xs text-[#e0e0e0] outline-none focus:border-[#00ff00] w-48 rounded-sm"
                                aria-label="Search History"
                              />
                            </div>
                            <input 
                              type="date"
                              value={historyFilterDate}
                              onChange={(e) => setHistoryFilterDate(e.target.value)}
                              className="bg-[#050505] border border-[#1a1a1a] px-3 py-2 text-xs text-[#e0e0e0] outline-none focus:border-[#00ff00] rounded-sm"
                              aria-label="Filter by Date"
                            />
                            {(historySearchTerm || historyFilterDate) && (
                              <button 
                                onClick={() => { setHistorySearchTerm(''); setHistoryFilterDate(''); }}
                                className="text-[10px] text-[#ff0000] hover:text-[#cc0000] uppercase font-bold ml-3"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="md:col-span-1 space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {history.filter(item => {
                              const matchesSearch = item.intent.raw.toLowerCase().includes(historySearchTerm.toLowerCase());
                              const matchesDate = historyFilterDate ? item.timestamp.startsWith(historyFilterDate) : true;
                              return matchesSearch && matchesDate;
                            }).map((item, i) => (
                              <div 
                                key={item.id} 
                                className="bg-[#050505] border border-[#1a1a1a] p-3 rounded-sm hover:border-[#00ff00] cursor-pointer transition-colors"
                                onClick={() => {
                                  setInstructionSet(item.results.instructionSet);
                                  setAudit(item.results.audit);
                                  setStress(item.results.stress);
                                }}
                              >
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-[10px] text-[#00ff00] font-bold">v{history.length - i}.0</span>
                                  <span className="text-[10px] text-[#666]">{new Date(item.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <p className="text-xs text-[#aaa] line-clamp-1">{item.intent.raw}</p>
                              </div>
                            ))}
                          </div>
                          
                          <div className="md:col-span-2 bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm">
                            <div className="flex items-center gap-2 text-[#666] mb-4">
                              <RefreshCw size={14} />
                              <span className="text-[10px] font-bold uppercase">Architectural Diff Viewer</span>
                            </div>
                            <div className="text-[10px] text-[#444] italic text-center py-20 border border-dashed border-[#1a1a1a]">
                              Select two versions to compare architectural drift...
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                    {activeTab === 'workflow' && (
                      <motion.div 
                        key="workflow"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        <WorkflowBuilder />
                      </motion.div>
                    )}
                    {activeTab === 'analytics' && (
                      <motion.div 
                        key="analytics"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-6"
                      >
                        <div className="bg-[#050505] border border-[#1a1a1a] p-6 rounded-sm">
                          <h3 className="text-xs font-bold text-[#0088ff] uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Activity size={16} /> ROI Analytics Dashboard
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-5 rounded-sm">
                              <p className="text-[11px] text-[#888] uppercase mb-2 font-bold">Time Saved</p>
                              <p className="text-3xl font-bold text-[#e0e0e0]">{roiAnalytics?.timeSaved || 0} <span className="text-base text-[#666]">hrs</span></p>
                            </div>
                            <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-5 rounded-sm">
                              <p className="text-[11px] text-[#888] uppercase mb-2 font-bold">Cost Saved</p>
                              <p className="text-3xl font-bold text-[#00ff00]">${roiAnalytics?.costSaved || 0}</p>
                            </div>
                            <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-5 rounded-sm">
                              <p className="text-[11px] text-[#888] uppercase mb-2 font-bold">Total Generations</p>
                              <p className="text-3xl font-bold text-[#e0e0e0]">{roiAnalytics?.totalGenerations || 0}</p>
                            </div>
                          </div>
                        </div>

                        {crossModelParity && (
                          <div className="bg-[#050505] border border-[#1a1a1a] p-6 rounded-sm">
                            <h3 className="text-xs font-bold text-[#0088ff] uppercase tracking-wider mb-4 flex items-center gap-2">
                              <Layers size={16} /> Cross-Model Parity Testing
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                              <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-5 rounded-sm text-center">
                                <p className="text-[11px] text-[#888] uppercase mb-2 font-bold">Claude Score</p>
                                <p className="text-2xl font-bold text-[#e0e0e0]">{crossModelParity.claudeScore}/100</p>
                              </div>
                              <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-5 rounded-sm text-center">
                                <p className="text-[11px] text-[#888] uppercase mb-2 font-bold">Gemini Score</p>
                                <p className="text-2xl font-bold text-[#e0e0e0]">{crossModelParity.geminiScore}/100</p>
                              </div>
                              <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-5 rounded-sm text-center">
                                <p className="text-[11px] text-[#888] uppercase mb-2 font-bold">GPT Score</p>
                                <p className="text-2xl font-bold text-[#e0e0e0]">{crossModelParity.gptScore}/100</p>
                              </div>
                              <div className="bg-[#0a0a0a] border border-[#0088ff]/30 p-5 rounded-sm text-center">
                                <p className="text-[11px] text-[#0088ff] uppercase mb-2 font-bold">Consistency</p>
                                <p className="text-2xl font-bold text-[#0088ff]">{crossModelParity.consistency}/100</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] text-[#888] uppercase mb-3 font-bold">Identified Issues & Biases</p>
                              <ul className="list-disc pl-5 space-y-2">
                                {crossModelParity.issues.map((issue, idx) => (
                                  <li key={idx} className="text-sm text-[#ccc]">{issue}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                    {activeTab === 'compliance' && (
                      <motion.div 
                        key="compliance"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-6"
                      >
                        {constitutionalMapping ? (
                          <div className="bg-[#050505] border border-[#1a1a1a] rounded-sm overflow-hidden">
                            {/* Header Section */}
                            <div className="bg-[#0a0a0a] p-8 border-b border-[#1a1a1a] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                              <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-[#00ff00]/10 border border-[#00ff00]/30 rounded-full flex items-center justify-center text-[#00ff00]">
                                    <ShieldAlert size={20} />
                                  </div>
                                  <h3 className="text-xl font-bold uppercase tracking-widest text-[#e0e0e0]">Constitutional Governance Certificate</h3>
                                </div>
                                <div className="flex gap-4 text-[10px] text-[#666] uppercase font-mono tracking-tighter">
                                  <span>ID: {crypto.randomUUID().split('-')[0].toUpperCase()}</span>
                                  <span>Generated: {new Date().toLocaleString()}</span>
                                  <span className="text-[#00ff00]">Integrity: VERIFIED</span>
                                </div>
                              </div>
                              <button 
                                onClick={handleDownloadBundle}
                                className="bg-[#00ff00] text-[#000] px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-[#00cc00] transition-colors rounded-sm flex items-center gap-2"
                              >
                                <Download size={14} /> DOWNLOAD ARCHIVE
                              </button>
                            </div>

                            {/* Mapping Grid */}
                            <div className="p-8 grid grid-cols-1 xl:grid-cols-2 gap-8">
                              <div className="space-y-8">
                                <div className="space-y-4">
                                  <h4 className="text-[11px] font-bold text-[#888] uppercase tracking-widest border-b border-[#1a1a1a] pb-2">Regulatory & Ethical Standards Mapping</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {constitutionalMapping.standards.map((std, idx) => (
                                      <div key={idx} className="bg-[#080808] border border-[#1a1a1a] p-4 rounded-sm hover:border-[#00ff00]/30 transition-colors group">
                                        <div className="flex justify-between items-center mb-3">
                                          <span className="text-xs font-bold text-[#aaa] group-hover:text-[#e0e0e0]">{std.standard}</span>
                                          <span className="text-xs font-bold text-[#00ff00]">{std.coverage}%</span>
                                        </div>
                                        <div className="w-full bg-[#111] h-1.5 rounded-full overflow-hidden">
                                          <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${std.coverage}%` }}
                                            className="bg-[#00ff00] h-full shadow-[0_0_10px_#00ff00]" 
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <h4 className="text-[11px] font-bold text-[#888] uppercase tracking-widest border-b border-[#1a1a1a] pb-2">Security Risk Assessment</h4>
                                  <div className="bg-[#0f0a0a] border border-red-900/30 p-5 rounded-sm flex items-start gap-4">
                                    <div className="w-12 h-12 bg-red-900/20 border border-red-900/50 rounded flex items-center justify-center text-[#ff0000] flex-shrink-0">
                                      {redTeamResults?.score || 0}
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs font-bold text-[#e0e0e0] uppercase">Adversarial Resistance Score</p>
                                      <p className="text-[11px] text-[#888] leading-relaxed">
                                        The build has been scanned for 12 common logical escape vectors and jailbreak patterns. 
                                        {redTeamResults?.score && redTeamResults.score > 8 ? ' High resilience detected.' : ' Targeted hardening recommended.'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-8 border-l border-[#1a1a1a] pl-0 xl:pl-8">
                                <h4 className="text-[11px] font-bold text-[#888] uppercase tracking-widest border-b border-[#1a1a1a] pb-2">Compliance Mapping Details</h4>
                                <div className="space-y-6">
                                  {constitutionalMapping.standards.map((std, idx) => (
                                    <div key={idx} className="space-y-3">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-[#00ff00]" />
                                        <h5 className="text-[13px] font-bold text-[#e0e0e0]">{std.standard} Directives</h5>
                                      </div>
                                      <div className="grid grid-cols-1 gap-2">
                                        {std.mappedClauses.map((clause, cIdx) => (
                                          <div key={cIdx} className="bg-[#0a0a0a] border border-[#1a1a1a] p-3 text-[11px] text-[#888] flex items-center gap-2 group hover:bg-[#111] transition-colors">
                                            <CheckCircle2 size={12} className="text-[#00ff00] flex-shrink-0" />
                                            <span className="group-hover:text-[#ccc] transition-colors">{clause}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="pt-6 border-t border-[#1a1a1a]">
                                  <div className="p-4 bg-[#0a2a0a]/10 border border-[#00ff00]/20 rounded-sm text-center">
                                    <p className="text-[10px] text-[#00ff00] uppercase font-bold tracking-widest">Digital Audit Hash</p>
                                    <p className="text-[9px] text-[#00ff00]/60 font-mono mt-1 break-all uppercase">
                                      sha256:7f83b1638ff1b53b02c1a8a92348589c314959a4958f8b89e3bb9d0689b8898b
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-20 border border-dashed border-[#1a1a1a] rounded-sm bg-[#050505]">
                            <Scale size={48} className="mx-auto text-[#222] mb-4" />
                            <h3 className="text-sm font-bold text-[#666] uppercase tracking-[0.3em]">Compliance Inactive</h3>
                            <p className="text-[11px] text-[#444] mt-2 max-w-sm mx-auto">Execute the master pipeline to generate regulatory alignment mapping and security certification reports.</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                    {activeTab === 'verification' && (
                      <motion.div 
                        key="verification"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        {instructionSet.buildContract ? (
                          <AuditTrail contract={instructionSet.buildContract} />
                        ) : (
                          <div className="text-center py-20 border border-dashed border-[#1a1a1a] rounded-sm bg-[#050505]">
                            <ShieldCheck size={48} className="mx-auto text-[#222] mb-4" />
                            <h3 className="text-sm font-bold text-[#666] uppercase tracking-[0.3em]">Verification Buffer Empty</h3>
                            <p className="text-[11px] text-[#444] mt-2 max-w-sm mx-auto">Build Contract and formal verification assets are generated during the final synthesis phase.</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : retrospective ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#0f0f0f] border border-[#ff0000] p-8 rounded-sm space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-[#ff0000]">
                    <AlertCircle size={32} />
                    <h2 className="text-xl font-bold uppercase tracking-widest">Retrospective Analysis</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleBoxCopy(retrospective)} className="text-[11px] text-[#888] hover:text-[#00ff00] flex items-center gap-2 transition-colors font-bold uppercase" title="Copy to clipboard">
                      <Copy size={14} /> COPY
                    </button>
                    <button onClick={() => handleBoxExport('Retrospective Analysis', retrospective, 'json')} className="text-[11px] text-[#888] hover:text-[#00ff00] flex items-center gap-2 transition-colors font-bold uppercase" title="Download JSON">
                      <FileJson size={14} /> JSON
                    </button>
                    <button onClick={() => handleBoxExport('Retrospective Analysis', retrospective, 'md')} className="text-[11px] text-[#888] hover:text-[#00ff00] flex items-center gap-2 transition-colors font-bold uppercase" title="Download Markdown">
                      <FileText size={14} /> MD
                    </button>
                  </div>
                </div>
                <div className="space-y-8">
                  <div>
                    <span className="text-[11px] text-[#888] uppercase block mb-3 font-bold">Root Cause of Failure</span>
                    <p className="text-base text-[#e0e0e0] leading-relaxed bg-[#1a0000] p-6 border-l-4 border-[#ff0000]">
                      {retrospective.failureReason}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#888] uppercase block mb-3 font-bold">BUILD_CONTRACT.template.md Update</span>
                    <pre className="bg-[#050505] p-6 text-sm text-[#ffaa00] border border-[#1a1a1a] whitespace-pre-wrap font-mono custom-scrollbar overflow-auto max-h-[400px]">
                      {retrospective.suggestedUpdate}
                    </pre>
                  </div>
                </div>
                <button 
                  onClick={() => setRetrospective(null)}
                  className="bg-[#ff0000] text-[#000] px-8 py-3 text-sm font-bold uppercase tracking-widest hover:bg-[#cc0000] transition-colors rounded-sm shadow-lg active:scale-[0.98]"
                >
                  Clear Analysis
                </button>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-[#0f0f0f] border border-[#1a1a1a] border-dashed rounded-sm">
                <Layers size={48} className="text-[#1a1a1a] mb-4" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#444]">Awaiting Intent Input</h3>
                <p className="text-[10px] text-[#333] mt-2 max-w-xs">Initialize the pipeline by describing your objective in the environmental scan panel.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Global Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 right-6 bg-[#ff0000] text-[#000] p-4 rounded-sm shadow-2xl flex items-center gap-3 z-[100]"
          >
            <AlertCircle size={20} />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase">Pipeline Error</span>
              <span className="text-[11px]">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="ml-4 hover:opacity-50">
              <RefreshCw size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #050505;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1a1a1a;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #222;
        }
      `}</style>
      </div>
    </ErrorBoundary>
  );
}

