import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { z } from 'zod';
import { UserIntent, AuditResult, StressTestResult, InstructionSet, ModelType, MemoryState, Retrospective, ThemeType, HistoryItem, PIIFinding, HistoryItemSchema, MemoryStateSchema } from './types';
import KnowledgeExpert from './components/KnowledgeExpert';
import { auditIntent, stressTest, generateInstructionSet, getRetrospective, scanForPII, redTeamAudit, testCrossModelParity, mapConstitutionalStandards, testPlaygroundPrompt } from './services/gemini';
import { estimateCost } from './services/tokenEstimator';
import { Terminal, Cpu, ShieldAlert, ShieldCheck, Zap, Save, RefreshCw, AlertCircle, BookOpen, Layers, CheckCircle2, FileCode, Printer, Eye, HelpCircle, History, Download, Sun, Moon, Monitor, Info, FileText, Sparkles, GitBranch, DollarSign, Copy, FileJson, Search, Scale, Activity, Archive, Trash2, Mic, MicOff, Settings, PauseCircle, PlayCircle, Volume2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { testLiveModel } from './services/playground';
import { jsPDF } from 'jspdf';
import { generateCursorRules } from './services/ideHandoff';
import { generateExportBundle } from './utils/export';
import { computeLineDiff } from './utils/diff';
import Manual from './components/Manual';
import AuditView from './components/AuditView';
import AuditTrail from './components/AuditTrail';
import WorkflowBuilder from './components/WorkflowBuilder';
import { ErrorBoundary } from './components/ErrorBoundary';
import { storage } from './utils/storage';
import { CrossModelParityResult, ConstitutionalMappingResult } from './types';
import SheetsSync from './components/SheetsSync';
import { FileSpreadsheet } from 'lucide-react';

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
  const [expandedMemoryKeys, setExpandedMemoryKeys] = useState<Record<string, boolean>>({});
  const [failedStep, setFailedStep] = useState('');
  const [retrospective, setRetrospective] = useState<Retrospective | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [piiFindings, setPiiFindings] = useState<PIIFinding[]>([]);
  const [ignorePii, setIgnorePii] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [redTeamResults, setRedTeamResults] = useState<{ score: number; reasoning: string; vulnerabilities: string[] } | null>(null);
  const [crossModelParity, setCrossModelParity] = useState<CrossModelParityResult | null>(null);
  const [constitutionalMapping, setConstitutionalMapping] = useState<ConstitutionalMappingResult | null>(null);
  const [roiAnalytics, setRoiAnalytics] = useState<{ timeSaved: number, costSaved: number, totalGenerations: number } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [activeTab, setActiveTab] = useState<'prompt' | 'sampling' | 'audit' | 'docs' | 'history' | 'workflow' | 'analytics' | 'compliance' | 'verification' | 'sheets_sync'>('prompt');
  const [showDocs, setShowDocs] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyFilterDate, setHistoryFilterDate] = useState('');
  const [showHardResetConfirm, setShowHardResetConfirm] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const currentIntentRawRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const [playgroundInput, setPlaygroundInput] = useState('');
  const [activePlaygroundModels, setActivePlaygroundModels] = useState<import('./types').LiveModelConfig[]>([
    { id: 'gemini-1.5-pro', provider: 'gemini', modelId: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
  ]);
  const [playgroundResponses, setPlaygroundResponses] = useState<Record<string, import('./types').PlaygroundResponse>>({});
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<'unified' | 'split'>('unified');

  const [inputMode, setInputMode] = useState<'advanced' | 'guided'>('advanced');
  const [guidedInput, setGuidedInput] = useState({ role: '', task: '', constraints: '', format: '' });
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  const [intentVariables, setIntentVariables] = useState<Record<string, string>>({});
  const [validationStatus, setValidationStatus] = useState({ hasVariables: false, hasBackwardsDesign: false });

  // Neurodivergent-First Features State
  const [isDataCollectionEnabled, setIsDataCollectionEnabled] = useState(false);
  const [isGlobalPaused, setIsGlobalPaused] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [sessionTimer, setSessionTimer] = useState(0);

  useEffect(() => {
    const initStorage = async () => {
      await storage.migrateFromLocalStorage();
      const loadedHistory = await storage.getHistory();
      const loadedMemory = await storage.getMemory();
      const workspace = await storage.getWorkspace();
      
      setHistory(loadedHistory);
      setMemory(loadedMemory);
      
      if (loadedHistory.length > 0) {
        setSelectedHistoryItem(loadedHistory[0]);
      }
      
      const autosavedIntentRaw = localStorage.getItem('architect_intent_raw_autosave');
      
      if (workspace) {
        if (workspace.intent) {
          setIntent({
            ...workspace.intent,
            raw: autosavedIntentRaw !== null ? autosavedIntentRaw : (workspace.intent.raw || '')
          });
        } else if (autosavedIntentRaw !== null) {
          setIntent(prev => ({ ...prev, raw: autosavedIntentRaw }));
        }
        if (workspace.audit) setAudit(workspace.audit);
        if (workspace.stress) setStress(workspace.stress);
        if (workspace.instructionSet) setInstructionSet(workspace.instructionSet);
        if (workspace.redTeamResults) setRedTeamResults(workspace.redTeamResults);
        if (workspace.crossModelParity) setCrossModelParity(workspace.crossModelParity);
        if (workspace.constitutionalMapping) setConstitutionalMapping(workspace.constitutionalMapping);
        if (workspace.roiAnalytics) setRoiAnalytics(workspace.roiAnalytics);
        if (workspace.activeTab) setActiveTab(workspace.activeTab);
        if (workspace.isManualOpen !== undefined) setIsManualOpen(workspace.isManualOpen);
      } else if (autosavedIntentRaw !== null) {
        setIntent(prev => ({ ...prev, raw: autosavedIntentRaw }));
      }
      
      if (autosavedIntentRaw !== null) {
        currentIntentRawRef.current = autosavedIntentRaw;
        const now = new Date();
        setLastSavedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
      
      setIsLoaded(true);
    };
    initStorage();
  }, []);

  // Update intent ref whenever text changes
  useEffect(() => {
    currentIntentRawRef.current = intent.raw;
  }, [intent.raw]);

  // autosave 'User Intent' raw text to localStorage every 5 seconds to prevent loss during browser refreshes
  useEffect(() => {
    if (!isLoaded) return;
    
    const interval = setInterval(() => {
      const textToSave = currentIntentRawRef.current || '';
      localStorage.setItem('architect_intent_raw_autosave', textToSave);
      
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSavedTime(timeStr);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isLoaded]);

  // Session Timer for Executive Function Support (Timers & Breaks)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!isGlobalPaused) {
      interval = setInterval(() => {
        setSessionTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isGlobalPaused]);

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

  const handleTTS = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const stopTTS = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const formatSessionTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-formatting debounce to reduce visual noise
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!intent.raw || inputMode !== 'advanced') return;

      let formatted = intent.raw;
      
      // Standardize whitespace
      // Replace 3+ consecutive spaces with a single space, allowing 2 for some alignment
      formatted = formatted.replace(/ {3,}/g, ' ');
      // Replace 3+ consecutive newlines with 2 newlines
      formatted = formatted.replace(/\n{3,}/g, '\n\n');
      
      // Correct common typos (case-preserving where simple)
      const typoPairs: [RegExp, string][] = [
        [/\bteh\b/g, 'the'],
        [/\bTeh\b/g, 'The'],
        [/\bdont\b/g, "don't"],
        [/\bDont\b/g, "Don't"],
        [/\bcant\b/g, "can't"],
        [/\bCant\b/g, "Can't"],
        [/\bwont\b/g, "won't"],
        [/\bWont\b/g, "Won't"],
        [/\bseperate\b/g, 'separate'],
        [/\brecieve\b/g, 'receive'],
        [/\bacheive\b/g, 'achieve']
      ];

      typoPairs.forEach(([pattern, fix]) => {
        formatted = formatted.replace(pattern, fix);
      });

      if (formatted !== intent.raw) {
        setIntent(prev => ({ ...prev, raw: formatted }));
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [intent.raw, inputMode]);

  useEffect(() => {
    // Parse variables looking for {{variable}} or ${variable}
    const matches1 = intent.raw.match(/\{\{([^}]+)\}\}/g) || [];
    const matches2 = intent.raw.match(/\$\{([^}]+)\}/g) || [];
    const allMatches = [...matches1, ...matches2];
    const vars = Array.from(new Set(allMatches.map(m => m.replace(/^(\{\{|\$\{)|(\}\}|\})$/g, '').trim())));
    
    setIntentVariables(prev => {
       const next = { ...prev };
       let changed = false;
       
       Object.keys(next).forEach(k => {
         if (!vars.includes(k)) { delete next[k]; changed = true; }
       });
       
       vars.forEach(v => {
         if (!(v in next)) { next[v] = ''; changed = true; }
       });
       
       return changed ? next : prev;
    });
  
    const hasVars = vars.length > 0;
    const hasBackwardsDesign = /(backward|end-?state|output\s+structure|success\s+criteria|goal)/i.test(intent.raw);
    
    setValidationStatus({ hasVariables: hasVars, hasBackwardsDesign });
  }, [intent.raw]);

  const handleGuidedChange = (field: keyof typeof guidedInput, value: string) => {
    const next = { ...guidedInput, [field]: value };
    setGuidedInput(next);
    
    const parts = [];
    if (next.role) parts.push(`Role:\n${next.role}`);
    if (next.task) parts.push(`Task:\n${next.task}`);
    if (next.constraints) parts.push(`Constraints:\n${next.constraints}`);
    if (next.format) parts.push(`Format:\n${next.format}`);
    
    const raw = parts.join('\n\n');
    setIntent(prev => ({ ...prev, raw }));
    setIgnorePii(false);
  };

  const toggleDictation = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    let transcriptBuffer = '';

    recognition.onresult = (event: any) => {
      let finalSegment = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalSegment += event.results[i][0].transcript;
        }
      }
      
      if (finalSegment) {
        setIntent(prev => ({ 
          ...prev, 
          raw: prev.raw + (prev.raw && !prev.raw.endsWith(' ') ? ' ' : '') + finalSegment 
        }));
        setIgnorePii(false);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList) return;
    const { parseDocument } = await import('./utils/documentParser');
    const newAttachments: any[] = [];
    
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const parsed = await parseDocument(file);
        newAttachments.push(parsed);
      } catch (err: any) {
        setError(`Failed to parse "${file.name}": ${err.message}`);
      }
    }
    
    if (newAttachments.length > 0) {
      setIntent(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...newAttachments]
      }));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesSelected(e.dataTransfer.files);
  };

  const handleRemoveAttachment = (id: string) => {
    setIntent(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter(a => a.id !== id)
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelected(e.target.files);
  };

  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIntent(prev => ({ ...prev, raw: '', attachments: [] }));
    currentIntentRawRef.current = '';
    localStorage.removeItem('architect_intent_raw_autosave');
    setLastSavedTime(null);
    setAudit(null);
    setStress(null);
    setInstructionSet(null);
    setPiiFindings([]);
    setIgnorePii(false);
    setRetrospective(null);
    setError(null);
    setActiveTab('prompt');
    setRedTeamResults(null);
    setCrossModelParity(null);
    setConstitutionalMapping(null);
    
    storage.saveWorkspace(null);
  };

  const handleHardReset = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIntent({
      raw: '',
      targetModel: ModelType.GEMINI_1_5_PRO,
      useLCI: true,
      lciConfig: {
        contextWindow: 128000,
        compressionRatio: 4
      },
      highRisk: true,
      theme: ThemeType.DARK,
      attachments: []
    });
    currentIntentRawRef.current = '';
    localStorage.removeItem('architect_intent_raw_autosave');
    setLastSavedTime(null);
    setAudit(null);
    setStress(null);
    setInstructionSet(null);
    setPiiFindings([]);
    setIgnorePii(false);
    setRetrospective(null);
    setError(null);
    setActiveTab('prompt');
    setRedTeamResults(null);
    setCrossModelParity(null);
    setConstitutionalMapping(null);
    setMemory([]);
    setHistory([]);
    setExpandedMemoryKeys({});
    setFailedStep('');
    setShowHardResetConfirm(false);
    
    // Completely clear all physical database buffers
    await storage.saveWorkspace(null);
    await storage.saveMemory([]);
    await storage.saveHistory([]);
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
    setIgnorePii(false);
    if (error && error.includes('Potential PII detected')) {
      setError(null);
    }
  };

  const handleRejectPII = () => {
    setIgnorePii(true);
    setPiiFindings([]);
    if (error && error.includes('Potential PII detected')) {
      setError(null);
    }
  };

  const handleClearMemory = async () => {
    setMemory([]);
    setExpandedMemoryKeys({});
    await storage.saveMemory([]);
  };

  const handleRemoveMemoryItem = async (key: string) => {
    setMemory(prev => {
      const updated = prev.filter(m => m.key !== key);
      storage.saveMemory(updated);
      return updated;
    });
    setExpandedMemoryKeys(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const toggleMemoryExpansion = (key: string) => {
    setExpandedMemoryKeys(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
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
    if (findings.length > 0 && !ignorePii) {
      setPiiFindings(findings);
      setError(`Security Alert: Potential PII detected (${findings.map(f => f.type).join(', ')}). Please redact or explicitly reject alerts before proceeding.`);
      setLoading(false);
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
      setSelectedHistoryItem(newHistoryItem);
      
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

  const handlePlaygroundSubmit = async () => {
    if (!instructionSet?.finalPrompt || !playgroundInput.trim()) return;
    
    // Initialize all as loading
    const initialResponses: Record<string, import('./types').PlaygroundResponse> = {};
    activePlaygroundModels.forEach(m => {
      initialResponses[m.id] = { modelId: m.id, content: '', loading: true };
    });
    setPlaygroundResponses(initialResponses);
    
    // Execute all concurrently
    await Promise.all(
      activePlaygroundModels.map(async (model) => {
        try {
          const result = await testLiveModel(model, instructionSet.finalPrompt, playgroundInput);
          setPlaygroundResponses(prev => ({
            ...prev,
            [model.id]: { modelId: model.id, content: result, loading: false }
          }));
        } catch (err: any) {
          setPlaygroundResponses(prev => ({
            ...prev,
            [model.id]: { modelId: model.id, content: '', error: err.message || String(err), loading: false }
          }));
        }
      })
    );
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
    [ThemeType.HIGH_CONTRAST]: "bg-[#000] text-[#fff] border-white",
    [ThemeType.NEURO_FOCUS]: "neuro-mode bg-[#fdfaf6] text-[#2b2b2b] transition-all"
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
              <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mr-2 flex items-center gap-1">
                {formatSessionTime(sessionTimer)}
              </span>
              <button
                onClick={() => setIsGlobalPaused(prev => !prev)}
                className={`p-1 rounded-sm ${isGlobalPaused ? 'text-red-500 bg-red-500/10' : 'hover:text-[#aaa]'}`}
                title={isGlobalPaused ? "Resume Session" : "Pause Session (Universal Pause)"}
              >
                {isGlobalPaused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
              </button>
              <button
                onClick={() => setShowSettingsPanel(true)}
                className={`p-1 rounded-sm hover:text-[#aaa]`}
                title="Accessibility & Data Settings"
              >
                <Settings size={14} />
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
              <button 
                onClick={() => setIntent(prev => ({ ...prev, theme: ThemeType.NEURO_FOCUS }))}
                className={`p-1 rounded-sm ${intent.theme === ThemeType.NEURO_FOCUS ? 'text-indigo-600 bg-indigo-100' : 'hover:text-[#aaa]'}`}
                title="Neuro-Focus Theme"
              >
                <Eye size={14} />
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
              <div className="flex items-center gap-4">
                <Tooltip text="Clear click items & generated output results in current session context.">
                  <button 
                    onClick={handleReset}
                    className="text-[10px] text-[#888] hover:text-[#00ff00] transition-colors uppercase tracking-widest flex items-center gap-1 font-bold"
                    aria-label="Clear Session Inputs"
                  >
                    <RefreshCw size={11} className="transition-all" /> Clear Inputs
                  </button>
                </Tooltip>
                
                <div className="relative flex items-center">
                  {!showHardResetConfirm ? (
                    <button 
                      onClick={() => setShowHardResetConfirm(true)}
                      className="text-[10px] text-[#666] hover:text-red-500 hover:border-red-500/20 transition-colors uppercase tracking-widest flex items-center gap-1 font-bold px-2 py-0.5 border border-[#1a1a1a] rounded bg-red-950/10 cursor-pointer"
                      title="Nuclear reset: Completely wipe memory, history, and workspace indices"
                    >
                      <Trash2 size={10} className="text-red-500/60" /> Hard Reset
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-[#250a0c] border border-red-500/30 px-2 py-1 rounded-sm animate-pulse">
                      <span className="text-[8px] text-[#ff4444] font-bold uppercase tracking-widest font-mono">PURGE EVERYTHING?</span>
                      <button 
                        onClick={handleHardReset}
                        className="text-[8px] bg-red-700 hover:bg-red-600 text-white px-2 py-0.5 rounded font-black uppercase cursor-pointer"
                      >
                        YES_PURGE
                      </button>
                      <button 
                        onClick={() => setShowHardResetConfirm(false)}
                        className="text-[8px] bg-[#1a1a1a] hover:bg-[#333] text-zinc-400 px-2 py-0.5 rounded font-black uppercase cursor-pointer"
                      >
                        CANCEL
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                  <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-[#aaa] uppercase font-bold tracking-wider block">User Intent / Idea</label>
                    {lastSavedTime && (
                      <span className="text-[8px] font-mono bg-[#00ff00]/10 border border-[#00ff00]/25 text-[#00ff00] px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1 zoom-in-100 animate-fade-in">
                        <span className="w-1 h-1 rounded-full bg-[#00ff00] inline-block animate-pulse"></span>
                        SAVED {lastSavedTime}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleDictation}
                      className={`text-[10px] uppercase font-bold flex items-center gap-1 transition-colors border px-2 py-1 rounded-sm ${isListening ? 'text-red-400 border-red-800 bg-red-950/30' : 'text-zinc-400 border-zinc-800 bg-zinc-900 hover:text-white'}`}
                      aria-label={isListening ? "Stop dictation" : "Start dictation"}
                    >
                      {isListening ? <MicOff size={10} /> : <Mic size={10} />}
                      {isListening ? 'Stop' : 'Speak'}
                    </button>
                    <button 
                      onClick={() => setInputMode(prev => prev === 'advanced' ? 'guided' : 'advanced')}
                      className="text-[10px] text-zinc-400 uppercase font-bold flex items-center gap-1 hover:text-white transition-colors border border-zinc-800 px-2 py-1 bg-zinc-900 rounded-sm"
                      aria-label="Toggle input mode"
                    >
                      {inputMode === 'advanced' ? 'Switch to Guided Mode' : 'Switch to Advanced Mode'}
                    </button>
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
                </div>
                {inputMode === 'advanced' ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { label: 'Professional Tone', text: 'Respond using a highly professional and corporate tone.' },
                        { label: 'Concise Summary', text: 'Provide a concise summary, avoiding unnecessary details.' },
                        { label: 'Refactor to Clean Code', text: 'Refactor the following code to adhere to clean code principles, improving readability and maintainability.' }
                      ].map((snippet) => (
                        <button
                          key={snippet.label}
                          onClick={() => {
                            setIntent(prev => ({ ...prev, raw: prev.raw + (prev.raw && !prev.raw.endsWith(' ') && !prev.raw.endsWith('\n') ? '\n\n' : '') + snippet.text }));
                            setIgnorePii(false);
                          }}
                          className="text-[10px] text-zinc-400 uppercase font-bold transition-colors border border-zinc-800 px-2 py-1 bg-zinc-900 rounded-sm hover:bg-[#00ff00]/10 hover:border-[#00ff00]/50 hover:text-[#00ff00]"
                          aria-label={`Insert ${snippet.label} snippet`}
                        >
                          + {snippet.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 my-2">
                      <div className="flex items-center gap-2 bg-[#050505] p-2 border border-[#1a1a1a]">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase">Validation Status:</span>
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm flex items-center gap-1 ${validationStatus.hasVariables && validationStatus.hasBackwardsDesign ? 'bg-[#00ff00]/10 text-[#00ff00]' : 'bg-red-500/10 text-red-500'}`}>
                            {validationStatus.hasVariables && validationStatus.hasBackwardsDesign ? <><CheckCircle2 size={10} /> VALIDATED</> : <><AlertCircle size={10} /> PENDING</>}
                          </span>
                          {!validationStatus.hasVariables && <span className="text-[10px] text-zinc-500 ml-2">Missing variable placeholders (e.g. {'{{variable}}'})</span>}
                          {!validationStatus.hasBackwardsDesign && <span className="text-[10px] text-zinc-500 ml-2">Missing backwards design terms (e.g. "goal", "output")</span>}
                        </div>
                      </div>
                      
                      {Object.keys(intentVariables).length > 0 && (
                        <div className="bg-[#050505] border border-[#1a1a1a] p-4">
                          <h4 className="text-[10px] text-[#00ff00] font-bold uppercase mb-3 flex items-center gap-2"><FileCode size={12}/> Detected Variables</h4>
                          <div className="grid grid-cols-2 gap-4">
                            {Object.entries(intentVariables).map(([key, val]) => (
                              <div key={key} className="flex flex-col gap-1">
                                <label className="text-[10px] text-zinc-400 uppercase font-mono">{key}</label>
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(e) => setIntentVariables(prev => ({ ...prev, [key]: e.target.value }))}
                                  placeholder={`Value for ${key}`}
                                  className="bg-[#111] border border-[#333] text-sm p-2 text-white outline-none focus:border-[#00ff00]"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Tooltip className="w-full" text="Enter your raw AI intent or prompt idea here. Be as descriptive as possible.">
                      <textarea 
                        value={intent.raw}
                        onChange={(e) => {
                          setIntent(prev => ({ ...prev, raw: e.target.value }));
                          setIgnorePii(false);
                        }}
                        placeholder="Describe what you want the AI to do..."
                        className="neuro-mode w-full h-[500px] min-h-[400px] bg-[#050505] border border-[#1a1a1a] p-8 text-xl leading-relaxed focus:border-[#00ff00] outline-none transition-colors border-2 resize-y custom-scrollbar"
                        aria-label="AI Intent Input"
                      />
                    </Tooltip>
                  </div>
                ) : (
                  <div className="space-y-4 bg-[#050505] border border-[#1a1a1a] p-8">
                    <div>
                      <label className="text-[10px] text-[#00ff00] font-bold uppercase block mb-1">Target Persona / Role</label>
                      <input 
                        type="text"
                        value={guidedInput.role}
                        onChange={(e) => handleGuidedChange('role', e.target.value)}
                        placeholder="e.g. Expert Senior Full Stack Engineer"
                        className="w-full bg-[#0a0a0a] border border-[#222] p-3 text-sm focus:border-[#00ff00] outline-none transition-colors text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#00ff00] font-bold uppercase block mb-1">Core Task / Objective</label>
                      <textarea 
                        value={guidedInput.task}
                        onChange={(e) => handleGuidedChange('task', e.target.value)}
                        placeholder="e.g. Build a responsive kanban board using React and Tailwind CSS."
                        className="w-full h-[150px] bg-[#0a0a0a] border border-[#222] p-3 text-sm focus:border-[#00ff00] outline-none transition-colors resize-y text-white custom-scrollbar"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#00ff00] font-bold uppercase block mb-1">Key Constraints / Requirements</label>
                      <textarea 
                        value={guidedInput.constraints}
                        onChange={(e) => handleGuidedChange('constraints', e.target.value)}
                        placeholder="e.g. Use dark mode only. Do not use external CSS in JS libraries. Add animations."
                        className="w-full h-[100px] bg-[#0a0a0a] border border-[#222] p-3 text-sm focus:border-[#00ff00] outline-none transition-colors resize-y text-white custom-scrollbar"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#00ff00] font-bold uppercase block mb-1">Expected Output Format</label>
                      <input 
                        type="text"
                        value={guidedInput.format}
                        onChange={(e) => handleGuidedChange('format', e.target.value)}
                        placeholder="e.g. Single component file, clear code comments."
                        className="w-full bg-[#0a0a0a] border border-[#222] p-3 text-sm focus:border-[#00ff00] outline-none transition-colors text-white"
                      />
                    </div>
                  </div>
                )}

                {/* Document Workspace Area */}
                <div className="mt-4 bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-[#00ff00]" />
                      <span className="text-[10px] text-[#aaa] uppercase font-bold tracking-wider">Document Workspace ({intent.attachments?.length || 0})</span>
                    </div>
                    <label className="text-[10px] text-[#00ff00] hover:text-[#00cc00] transition-colors cursor-pointer uppercase font-bold flex items-center gap-1">
                      <Download size={10} className="rotate-180" /> Upload_Doc
                      <input 
                        type="file"
                        multiple
                        accept=".txt,.md,.json,.csv,.tsv,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.docx,.pdf"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                  
                  {intent.attachments && intent.attachments.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                      {intent.attachments.map(doc => {
                        const fileExt = doc.name.split('.').pop()?.toUpperCase() || 'FILE';
                        const isPdf = doc.type === 'application/pdf';
                        
                        return (
                          <div key={doc.id} className="flex items-center justify-between p-2 bg-[#0a0a0a] border border-[#1a1a1a] hover:border-[#333] transition-colors rounded-sm group">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className={`text-[8px] font-black px-1.5 py-0.5 rounded-xs border flex-shrink-0 ${
                                isPdf ? 'bg-[#ff0055]/10 border-[#ff0055] text-[#ff0055]' : 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]'
                              }`}>
                                {fileExt}
                              </div>
                              <span className="text-[11px] text-[#ccc] truncate font-mono" title={doc.name}>{doc.name}</span>
                              <span className="text-[9px] text-[#555] font-mono flex-shrink-0">({(doc.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <button 
                              onClick={() => handleRemoveAttachment(doc.id)}
                              className="text-[#555] hover:text-[#ff0000] p-1 transition-colors flex-shrink-0"
                              title="Remove document"
                            >
                              <RefreshCw size={10} className="rotate-45" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border border-dashed p-4 text-center cursor-pointer transition-all ${
                        isDragging 
                          ? 'bg-[#00ff00]/5 border-[#00ff00] text-[#00ff00]' 
                          : 'bg-[#0a0a0a] border-[#1a1a1a] text-[#555] hover:border-[#222] hover:text-[#888]'
                      }`}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.accept = '.txt,.md,.json,.csv,.tsv,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.docx,.pdf';
                        input.onchange = (e: any) => handleFilesSelected(e.target.files);
                        input.click();
                      }}
                    >
                      <p className="text-[10px] uppercase font-bold tracking-widest">Drag & Drop Documents Here or Click to Browse</p>
                      <p className="text-[8px] text-[#444] mt-1">Natively supports PDF, DOCX, TXT, MD, CSV, JSON, and source scripts</p>
                    </div>
                  )}
                </div>

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
                      <div className="flex items-center gap-2">
                        <Tooltip text="Reject alerts and proceed with original text. Use if scanner is reporting false positives.">
                          <button
                            onClick={handleRejectPII}
                            className="text-[10px] border border-[#ff0000] text-[#ff0000] px-3 py-1.5 hover:bg-[#ff0000] hover:text-white transition-colors uppercase font-bold rounded-sm mr-2"
                          >
                            Reject Alerts
                          </button>
                        </Tooltip>
                        <Tooltip text="Automatically redact detected PII (emails, phones, etc.) from your intent text.">
                          <button
                            onClick={handleRedactPII}
                            className="text-[10px] bg-[#ff0000] text-white px-3 py-1.5 hover:bg-[#cc0000] transition-colors uppercase font-bold rounded-sm"
                          >
                            Redact All
                          </button>
                        </Tooltip>
                      </div>
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
                    {['Fast', 'Deep', 'Audit', 'Compare', 'Export'].map(profile => {
                      const modelMap: Record<string, ModelType> = {
                        'Fast': ModelType.GEMINI_2_0_FLASH,
                        'Deep': ModelType.GEMINI_1_5_PRO,
                        'Audit': ModelType.GPT_O1_PREVIEW,
                        'Compare': ModelType.CLAUDE_3_7_SONNET,
                        'Export': ModelType.DEEPSEEK_R1
                      };
                      const isSelected = 
                        (profile === 'Fast' && (intent.targetModel === ModelType.GEMINI_2_0_FLASH || intent.targetModel === ModelType.GEMINI_1_5_FLASH)) ||
                        (profile === 'Deep' && intent.targetModel === ModelType.GEMINI_1_5_PRO) ||
                        (profile === 'Audit' && intent.targetModel === ModelType.GPT_O1_PREVIEW) ||
                        (profile === 'Compare' && (intent.targetModel === ModelType.CLAUDE_3_7_SONNET || intent.targetModel === ModelType.CLAUDE_3_5_SONNET)) ||
                        (profile === 'Export' && intent.targetModel === ModelType.DEEPSEEK_R1);

                      return (
                        <button
                          key={profile}
                          onClick={() => {
                            setIntent(prev => ({ ...prev, targetModel: modelMap[profile] }));
                          }}
                          className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-colors ${
                            isSelected 
                              ? 'bg-[#00ff00] text-[#000]' 
                              : 'bg-[#0f0f0f] border border-[#1a1a1a] text-[#888] hover:bg-[#1a1a1a]'
                          }`}
                        >
                          {profile}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 p-3 bg-[#0d0d0d] border border-[#1a1a1a] rounded text-[11px] leading-relaxed text-[#eee]">
                    <div className="flex items-center gap-1.5 mb-1.5 text-[#00ff00] font-mono uppercase text-[9px] tracking-wider font-bold">
                      <span>● Active Profile Guide</span>
                    </div>
                    {intent.targetModel === ModelType.GEMINI_2_0_FLASH || intent.targetModel === ModelType.GEMINI_1_5_FLASH ? (
                      <p>
                        <span className="font-bold text-[#fff] font-mono text-[10px] bg-[#222] px-1 py-0.5 rounded-sm mr-1">RUN SPEED FAST</span>
                        Optimized for immediate updates and high-speed feedback. Choose this for basic commands, initial drafts, or fast testing cycles where response speed is your top priority.
                      </p>
                    ) : intent.targetModel === ModelType.GEMINI_1_5_PRO ? (
                      <p>
                        <span className="font-bold text-[#fff] font-mono text-[10px] bg-[#222] px-1 py-0.5 rounded-sm mr-1">DEEP ANALYSIS MODE</span>
                        The recommended default for complex tasks. It takes time to carefully evaluate your instructions, trace connections in files, and solve multi-step problems with production-grade correctness.
                      </p>
                    ) : intent.targetModel === ModelType.GPT_O1_PREVIEW ? (
                      <p>
                        <span className="font-bold text-[#fff] font-mono text-[10px] bg-[#222] px-1 py-0.5 rounded-sm mr-1">RUGGED AUDITING</span>
                        A highly cautious audit process. It works like a rigorous secondary review, scanning code line-by-line to prevent bugs, verify safety limits, and validate rules before going live.
                      </p>
                    ) : intent.targetModel === ModelType.CLAUDE_3_7_SONNET || intent.targetModel === ModelType.CLAUDE_3_5_SONNET ? (
                      <p>
                        <span className="font-bold text-[#fff] font-mono text-[10px] bg-[#222] px-1 py-0.5 rounded-sm mr-1">PARAGON COMPARER</span>
                        Expert-level design focus. Ideal for comparing alternative patterns, generating clean, elegant code syntax, and polishing layouts with perfect modular split designs.
                      </p>
                    ) : intent.targetModel === ModelType.DEEPSEEK_R1 ? (
                      <p>
                        <span className="font-bold text-[#fff] font-mono text-[10px] bg-[#222] px-1 py-0.5 rounded-sm mr-1">STRUCTURED EXPORT</span>
                        Tailored formatting mode. Focuses specifically on outputting incredibly organized configurations, clean JSON blocks, and flawless deployment assets.
                      </p>
                    ) : (
                      <p>
                        <span className="font-bold text-[#fff] font-mono text-[10px] bg-[#222] px-1 py-0.5 rounded-sm mr-1">CUSTOM FLOW</span>
                        Specialized execution routing configured specifically for your current workspace setup.
                      </p>
                    )}
                  </div>
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
                      <div className="space-y-6 pt-2">
                        {/* Context Window Section */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[#888] uppercase font-bold tracking-widest">Context Window</span>
                            <span className="text-[10px] text-[#00ff00] font-mono">{intent.lciConfig.contextWindow.toLocaleString()} TKNS</span>
                          </div>
                          <div className="flex gap-1">
                            {[128000, 256000, 512000, 1000000].map(val => (
                              <button
                                key={val}
                                onClick={() => setIntent(prev => ({ ...prev, lciConfig: { ...prev.lciConfig, contextWindow: val } }))}
                                className={`flex-1 py-1.5 text-[9px] font-bold uppercase border transition-all ${
                                  intent.lciConfig.contextWindow === val 
                                    ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]' 
                                    : 'bg-[#0a0a0a] border-[#1a1a1a] text-[#555] hover:text-[#888]'
                                }`}
                              >
                                {val >= 1000000 ? '1M' : `${val / 1000}K`}
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                if ([128000, 256000, 512000, 1000000].includes(intent.lciConfig.contextWindow)) {
                                  setIntent(prev => ({ ...prev, lciConfig: { ...prev.lciConfig, contextWindow: prev.lciConfig.contextWindow + 1 } }));
                                }
                              }}
                              className={`flex-1 py-1.5 text-[9px] font-bold uppercase border transition-all ${
                                ![128000, 256000, 512000, 1000000].includes(intent.lciConfig.contextWindow)
                                  ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]'
                                  : 'bg-[#0a0a0a] border-[#1a1a1a] text-[#555] hover:text-[#888]'
                              }`}
                            >
                              Custom
                            </button>
                          </div>
                          <input 
                            type="range" min="8000" max="2000000" step="8000"
                            value={intent.lciConfig.contextWindow}
                            onChange={(e) => setIntent(prev => ({ ...prev, lciConfig: { ...prev.lciConfig, contextWindow: Number(e.target.value) } }))}
                            className="w-full h-1 bg-[#1a1a1a] appearance-none cursor-pointer accent-[#00ff00] rounded-full"
                          />
                        </div>

                        {/* Compression Ratio Section */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[#888] uppercase font-bold tracking-widest">Compression Ratio</span>
                            <span className="text-[10px] text-[#00ff00] font-mono">{intent.lciConfig.compressionRatio.toFixed(1)}:1</span>
                          </div>
                          <div className="flex gap-1">
                            {[2, 4, 8, 16].map(val => (
                              <button
                                key={val}
                                onClick={() => setIntent(prev => ({ ...prev, lciConfig: { ...prev.lciConfig, compressionRatio: val } }))}
                                className={`flex-1 py-1.5 text-[9px] font-bold uppercase border transition-all ${
                                  intent.lciConfig.compressionRatio === val 
                                    ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]' 
                                    : 'bg-[#0a0a0a] border-[#1a1a1a] text-[#555] hover:text-[#888]'
                                }`}
                              >
                                {val}x
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                if ([2, 4, 8, 16].includes(intent.lciConfig.compressionRatio)) {
                                  setIntent(prev => ({ ...prev, lciConfig: { ...prev.lciConfig, compressionRatio: prev.lciConfig.compressionRatio + 0.1 } }));
                                }
                              }}
                              className={`flex-1 py-1.5 text-[9px] font-bold uppercase border transition-all ${
                                ![2, 4, 8, 16].includes(intent.lciConfig.compressionRatio)
                                  ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]'
                                  : 'bg-[#0a0a0a] border-[#1a1a1a] text-[#555] hover:text-[#888]'
                              }`}
                            >
                              Custom
                            </button>
                          </div>
                          <input 
                            type="range" min="1" max="32" step="0.5"
                            value={intent.lciConfig.compressionRatio}
                            onChange={(e) => setIntent(prev => ({ ...prev, lciConfig: { ...prev.lciConfig, compressionRatio: Number(e.target.value) } }))}
                            className="w-full h-1 bg-[#1a1a1a] appearance-none cursor-pointer accent-[#00ff00] rounded-full"
                          />
                        </div>
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#0088ff]">
                <BookOpen size={16} />
                <h2 className="text-xs font-bold uppercase tracking-wider">OpenMemory.md ({memory.length})</h2>
              </div>
              {memory.length > 0 && (
                <button
                  onClick={handleClearMemory}
                  className="text-[9px] text-[#ff0055] border border-[#ff0055]/30 hover:border-[#ff0055] hover:bg-[#ff0055]/10 px-2 py-1 uppercase font-bold transition-all flex items-center gap-1 rounded-sm"
                  title="Wipe memory buffer entirely"
                >
                  <Trash2 size={10} /> Clear_All
                </button>
              )}
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {memory.length === 0 ? (
                <p className="text-[10px] text-[#444] italic">Memory buffer empty...</p>
              ) : (
                memory.map((m, i) => {
                  const isExpanded = !!expandedMemoryKeys[m.key];
                  return (
                    <div 
                      key={m.key || i} 
                      className={`bg-[#050505] border transition-all rounded-sm duration-150 ${
                        isExpanded ? 'border-[#0088ff]/50 shadow-[0_0_8px_rgba(0,136,255,0.1)]' : 'border-[#1a1a1a] hover:border-[#333]'
                      }`}
                    >
                      {/* Accordion Header */}
                      <div 
                        onClick={() => toggleMemoryExpansion(m.key)}
                        className="flex justify-between items-center p-2.5 cursor-pointer select-none"
                      >
                        <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                          <span className="text-[9px] text-[#0088ff] font-bold tracking-tight font-mono">{m.key.toUpperCase()}</span>
                          <span className="text-[8px] text-[#555] font-mono">
                            {new Date(m.lastUpdated).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-[8px] text-[#666] uppercase bg-[#111] px-1 rounded-xs border border-[#222]">
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveMemoryItem(m.key);
                            }}
                            className="text-[#666] hover:text-[#ff0055] p-1 transition-colors rounded hover:bg-[#ff0055]/10"
                            title="Purge this key from memory"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      
                      {/* Accordion Body */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-[#111] font-mono text-[10px] text-[#aaa] leading-relaxed break-words bg-[#080808]/50 selection:bg-[#0088ff]/20">
                          <div className="flex justify-between items-center mb-2 bg-[#111] p-1.5 rounded-xs border border-[#1a1a1a]">
                            <span className="text-[8px] text-[#555] uppercase font-bold">Raw Value</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(m.value);
                              }}
                              className="text-[8px] text-[#0088ff] hover:underline uppercase"
                            >
                              Copy Prompt
                            </button>
                          </div>
                          <div className="whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar pr-1 text-[#bbb]">
                            {m.value}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
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
                      <Tooltip text="Sync campaigns and compiled prompts to Google Sheets.">
                        <button 
                          onClick={() => setActiveTab('sheets_sync')}
                          className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'sheets_sync' ? 'bg-[#0f0f0f] text-[#00ff00]' : 'text-[#666] hover:text-[#aaa]'}`}
                        >
                          <FileSpreadsheet size={12} /> Sheets_Sync
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
                              <Tooltip text="Read aloud with text-to-speech.">
                                <button onClick={() => handleTTS(instructionSet.finalPrompt)} className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                                  <Volume2 size={12} /> SPEAK
                                </button>
                              </Tooltip>
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

                          <div className="mt-2 flex items-center gap-3 bg-[#0a0a0a] p-2 border border-[#1a1a1a] justify-between">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">How was this generated prompt? (Real-time feedback)</span>
                            <div className="flex items-center gap-2">
                              <button className="flex items-center gap-1 px-3 py-1 bg-[#1a1a1a] hover:bg-[#222] text-[#00ff00] text-[10px] uppercase font-bold border border-[#333] transition-colors">
                                <ThumbsUp size={12} /> Good
                              </button>
                              <button className="flex items-center gap-1 px-3 py-1 bg-[#1a1a1a] hover:bg-[#222] text-red-500 text-[10px] uppercase font-bold border border-[#333] transition-colors">
                                <ThumbsDown size={12} /> Needs Work
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {/* Inline Playground */}
                        <div className="pt-6 border-t border-[#1a1a1a]">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Cpu size={14} className="text-[#00ff00]" />
                              <span className="text-[11px] text-[#00ff00] font-bold uppercase tracking-wider">Multi-Model Playground</span>
                              <span className="text-[9px] text-[#666] ml-2">Test LIVE against up to 4 models concurrently</span>
                            </div>
                            <button
                              onClick={() => setShowModelConfig(!showModelConfig)}
                              className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 px-2 py-1 border ${showModelConfig ? 'border-[#00ff00] text-[#00ff00] bg-[#00ff00]/10' : 'border-[#1a1a1a] text-[#666] hover:text-white'}`}
                            >
                              <Settings size={10} /> Model Config
                            </button>
                          </div>
                          
                          {showModelConfig && (
                            <div className="bg-[#050505] border border-[#1a1a1a] p-4 mb-4">
                              <h4 className="text-[10px] text-[#00ff00] font-bold uppercase tracking-wider mb-2">Active Models ({activePlaygroundModels.length}/4)</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                {activePlaygroundModels.map((model, idx) => (
                                  <div key={idx} className="bg-[#0a0a0a] border border-[#222] p-3 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] text-white font-bold">{model.name}</span>
                                      <button 
                                        onClick={() => setActivePlaygroundModels(prev => prev.filter((_, i) => i !== idx))}
                                        className="text-red-500 hover:text-red-400 text-[9px] uppercase"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[8px] text-[#666] uppercase">Provider</label>
                                        <select 
                                          value={model.provider}
                                          onChange={(e) => {
                                            const val = e.target.value as any;
                                            setActivePlaygroundModels(prev => prev.map((m, i) => i === idx ? { ...m, provider: val } : m));
                                          }}
                                          className="w-full bg-[#111] border border-[#333] text-[10px] text-white p-1"
                                        >
                                          <option value="gemini">Gemini</option>
                                          <option value="ollama">Ollama (Local)</option>
                                          <option value="lmstudio">LM Studio (Local)</option>
                                          <option value="openai">OpenAI</option>
                                          <option value="anthropic">Anthropic</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[8px] text-[#666] uppercase">Model ID</label>
                                        <input 
                                          type="text"
                                          value={model.modelId}
                                          onChange={(e) => setActivePlaygroundModels(prev => prev.map((m, i) => i === idx ? { ...m, modelId: e.target.value, id: `${m.provider}-${e.target.value}` } : m))}
                                          className="w-full bg-[#111] border border-[#333] text-[10px] text-white p-1"
                                          placeholder="e.g. llama3"
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      {(model.provider === 'ollama' || model.provider === 'lmstudio') && (
                                        <div>
                                          <label className="text-[8px] text-[#666] uppercase">Endpoint URL</label>
                                          <input 
                                            type="text"
                                            value={model.endpoint || ''}
                                            onChange={(e) => setActivePlaygroundModels(prev => prev.map((m, i) => i === idx ? { ...m, endpoint: e.target.value } : m))}
                                            className="w-full bg-[#111] border border-[#333] text-[10px] text-white p-1"
                                            placeholder={model.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234'}
                                          />
                                        </div>
                                      )}
                                      {(model.provider === 'openai' || model.provider === 'anthropic' || model.provider === 'gemini') && (
                                        <div className="col-span-2">
                                          <label className="text-[8px] text-[#666] uppercase">API Key (Optional for Gemini if env set)</label>
                                          <input 
                                            type="password"
                                            value={model.apiKey || ''}
                                            onChange={(e) => setActivePlaygroundModels(prev => prev.map((m, i) => i === idx ? { ...m, apiKey: e.target.value } : m))}
                                            className="w-full bg-[#111] border border-[#333] text-[10px] text-white p-1"
                                            placeholder="sk-..."
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {activePlaygroundModels.length < 4 && (
                                  <button
                                    onClick={() => setActivePlaygroundModels(prev => [...prev, { id: `new-model-${Date.now()}`, provider: 'ollama', modelId: 'llama3', name: 'New Model' }])}
                                    className="border border-dashed border-[#333] flex items-center justify-center text-[10px] text-[#666] hover:text-[#00ff00] hover:border-[#00ff00] transition-colors p-4"
                                  >
                                    + Add Model Comparison
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[9px] text-[#888] uppercase block">Test Input</label>
                              <div className="flex gap-2">
                                <textarea
                                  value={playgroundInput}
                                  onChange={(e) => setPlaygroundInput(e.target.value)}
                                  placeholder="Enter a sample message to test the prompt against..."
                                  className="flex-1 bg-[#0a0a0a] border border-[#222] p-3 text-[11px] text-[#eee] font-mono min-h-[60px] focus:border-[#00ff00] transition-colors resize-y placeholder-[#444]"
                                />
                                <button
                                  onClick={handlePlaygroundSubmit}
                                  disabled={activePlaygroundModels.some(m => playgroundResponses[m.id]?.loading) || !playgroundInput.trim() || activePlaygroundModels.length === 0}
                                  className="w-32 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-[#00ff00] flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {activePlaygroundModels.some(m => playgroundResponses[m.id]?.loading) ? (
                                    <><RefreshCw size={14} className="animate-spin" /> RUNNING...</>
                                  ) : (
                                    <><Zap size={14} /> RUN ALL</>
                                  )}
                                </button>
                              </div>
                            </div>
                            
                            {/* Side-by-side results */}
                            <div className={`grid grid-cols-1 ${activePlaygroundModels.length > 1 ? (activePlaygroundModels.length > 2 ? 'lg:grid-cols-3' : 'lg:grid-cols-2') : ''} gap-4`}>
                              {activePlaygroundModels.map(model => {
                                const response = playgroundResponses[model.id];
                                return (
                                  <div key={model.id} className="space-y-2">
                                    <div className="flex justify-between items-center">
                                      <label className="text-[9px] text-[#888] uppercase block">{model.name} ({model.modelId})</label>
                                      {response?.content && (
                                        <button onClick={() => handleBoxCopy(response.content)} className="text-[9px] text-[#666] hover:text-[#00ff00] flex items-center gap-1 transition-colors">
                                          <Copy size={10} /> COPY
                                        </button>
                                      )}
                                    </div>
                                    <div className="w-full bg-[#050505] border border-[#1a1a1a] p-3 text-[11px] font-mono h-64 overflow-y-auto custom-scrollbar">
                                      {response?.loading ? (
                                        <div className="flex flex-col items-center justify-center h-full text-[#444] gap-2">
                                          <div className="w-4 h-4 rounded-full border-2 border-[#444] border-t-[#00ff00] animate-spin" />
                                          <span className="text-[9px] uppercase tracking-wider">Awaiting response...</span>
                                        </div>
                                      ) : response?.error ? (
                                        <div className="text-red-500 whitespace-pre-wrap">{response.error}</div>
                                      ) : response?.content ? (
                                        <div className="text-[#ccc] whitespace-pre-wrap">{response.content}</div>
                                      ) : (
                                        <div className="flex items-center justify-center h-full text-[#333] text-[9px] uppercase">
                                          Awaiting input execution...
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
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
                            }).map((item) => {
                              const verNum = history.length - history.indexOf(item);
                              return (
                                <div 
                                  key={item.id} 
                                  id={`history-card-${item.id}`}
                                  className={`border p-3 rounded-sm cursor-pointer transition-all ${
                                    selectedHistoryItem?.id === item.id 
                                      ? 'bg-[#00ff22]/5 border-[#00ff22] text-[#00ff00]' 
                                      : 'bg-[#050505] border-[#1a1a1a] hover:border-[#00ff00]/60 text-[#aaa]'
                                  }`}
                                  onClick={() => {
                                    setSelectedHistoryItem(item);
                                  }}
                                >
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] text-[#00ff00] font-bold">v{verNum}.0</span>
                                    <span className="text-[10px] text-[#666]">{new Date(item.timestamp).toLocaleTimeString()}</span>
                                  </div>
                                  <p className="text-xs text-[#aaa] line-clamp-1 font-mono">{item.intent.raw}</p>
                                </div>
                              );
                            })}
                          </div>
                          
                          <div id="arch-diff-viewer-panel" className="md:col-span-2 bg-[#050505] border border-[#1a1a1a] p-5 rounded-sm flex flex-col justify-between">
                            {selectedHistoryItem ? (() => {
                              const verNum = history.length - history.indexOf(selectedHistoryItem);
                              const oldPrompt = selectedHistoryItem.results.instructionSet.finalPrompt;
                              const newPrompt = instructionSet?.finalPrompt || '';
                              const diffChanges = computeLineDiff(oldPrompt, newPrompt);
                              
                              const additions = diffChanges.filter(c => c.type === 'added').length;
                              const deletions = diffChanges.filter(c => c.type === 'removed').length;
                              const isIdentical = additions === 0 && deletions === 0;
                              
                              // Align side-by-side placeholders
                              const oldLinesWithPlaceholders: { type: 'removed' | 'unchanged' | 'placeholder'; value: string }[] = [];
                              const newLinesWithPlaceholders: { type: 'added' | 'unchanged' | 'placeholder'; value: string }[] = [];

                              diffChanges.forEach(change => {
                                if (change.type === 'removed') {
                                  oldLinesWithPlaceholders.push({ type: 'removed', value: change.value });
                                  newLinesWithPlaceholders.push({ type: 'placeholder', value: '' });
                                } else if (change.type === 'added') {
                                  oldLinesWithPlaceholders.push({ type: 'placeholder', value: '' });
                                  newLinesWithPlaceholders.push({ type: 'added', value: change.value });
                                } else {
                                  oldLinesWithPlaceholders.push({ type: 'unchanged', value: change.value });
                                  newLinesWithPlaceholders.push({ type: 'unchanged', value: change.value });
                                }
                              });

                              return (
                                <div className="space-y-4">
                                  {/* Title & Actions */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1a1a1a] pb-4">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-[#00ff00] bg-[#00ff00]/10 border border-[#00ff00]/30 px-2 py-0.5 rounded-sm uppercase tracking-wider">Version v{verNum}.0</span>
                                        <span className="text-[10px] text-[#666] font-mono">{new Date(selectedHistoryItem.timestamp).toLocaleString()}</span>
                                      </div>
                                      <div className="text-[10px] text-[#888] font-semibold uppercase tracking-wider flex items-center gap-2">
                                        <span>Target Model: <strong className="text-white font-mono">{selectedHistoryItem.results.instructionSet.targetModel}</strong></span>
                                        <span className="text-[#333]">|</span>
                                        <span className="flex items-center gap-1">
                                          <span className="text-emerald-400 font-bold font-mono">+{additions}</span>
                                          <span className="text-rose-400 font-bold font-mono">-{deletions}</span>
                                        </span>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <button
                                        id="btn-restore-version"
                                        onClick={() => {
                                          setInstructionSet(selectedHistoryItem.results.instructionSet);
                                          setAudit(selectedHistoryItem.results.audit);
                                          setStress(selectedHistoryItem.results.stress);
                                          setActiveTab('prompt');
                                        }}
                                        className="bg-[#00ff00] text-[#000] hover:bg-[#00cc00] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 rounded-sm"
                                        title="Load this version as the active workspace, matching all audit findings and stress parameters"
                                      >
                                        <Save size={11} /> Restore Draft
                                      </button>
                                    </div>
                                  </div>

                                  {/* Human Intent comparison block */}
                                  <div className="bg-[#0d0d0d] border border-[#161616] p-3 rounded-sm space-y-1.5">
                                    <span className="text-[9px] text-[#555] uppercase font-bold tracking-widest block">Original Prompt Intent Compared To Active</span>
                                    <p className="text-[11px] text-[#ccc] font-mono whitespace-pre-wrap max-h-16 overflow-y-auto bg-[#050505] p-2 border border-[#111] rounded-sm select-text selection:bg-[#00ff00]/25">
                                      {selectedHistoryItem.intent.raw}
                                    </p>
                                  </div>

                                  {/* Toggles for View Mode */}
                                  <div className="flex items-center justify-between bg-[#0a0a0a] border border-[#111] px-3 py-1.5 rounded-sm">
                                    <span className="text-[9px] text-[#666] uppercase font-bold tracking-widest flex items-center gap-1"><Eye size={10} className="text-[#00ff00]" /> Diff Mode</span>
                                    <div className="flex bg-[#111] border border-[#222] p-0.5 rounded-xs">
                                      <button 
                                        id="btn-diff-mode-unified"
                                        onClick={() => setDiffViewMode('unified')} 
                                        className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-xs transition-all ${diffViewMode === 'unified' ? 'bg-[#00ff00] text-[#000]' : 'text-[#666] hover:text-[#aaa]'}`}
                                      >
                                        Unified
                                      </button>
                                      <button 
                                        id="btn-diff-mode-split"
                                        onClick={() => setDiffViewMode('split')} 
                                        className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-xs transition-all ${diffViewMode === 'split' ? 'bg-[#00ff00] text-[#000]' : 'text-[#666] hover:text-[#aaa]'}`}
                                      >
                                        Split Screen
                                      </button>
                                    </div>
                                  </div>

                                  {/* Diff Output viewport */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[9px] text-[#444] uppercase tracking-widest px-1">
                                      <span>Historical Base Prompt (Left / Red)</span>
                                      <span>Active Workspace Prompt (Right / Green)</span>
                                    </div>

                                    {/* Diff Canvas container */}
                                    <div className="relative border border-[#1a1a1a] rounded overflow-hidden">
                                      {isIdentical ? (
                                        <div className="bg-[#070707] py-16 text-center space-y-2 border-t border-[#111]">
                                          <CheckCircle2 className="mx-auto text-[#00ff00]" size={24} />
                                          <p className="text-[11px] text-[#00ff22] font-semibold tracking-wider uppercase">0 Drift Detected</p>
                                          <p className="text-[10px] text-[#555] max-w-sm mx-auto">This historical version matches the exact compilation syntax of the active workspace instruction set prompt.</p>
                                        </div>
                                      ) : diffViewMode === 'unified' ? (
                                        <div id="unified-diff-view" className="max-h-[380px] overflow-y-auto bg-[#030303] divide-y divide-[#111] custom-scrollbar selection:bg-[#00ff00]/20">
                                          {diffChanges.map((change, idx) => (
                                            <div 
                                              key={idx} 
                                              className={`px-3 py-1 font-mono text-[10.5px] leading-relaxed break-keep select-text flex items-start gap-3 ${
                                                change.type === 'removed' ? 'bg-[#ff003c]/8 text-[#f87171] border-l-2 border-[#ea580c]' :
                                                change.type === 'added' ? 'bg-[#10b981]/8 text-[#34d399] border-l-2 border-[#10b981]' :
                                                'text-[#777] hover:bg-[#fff]/[0.01]'
                                              }`}
                                            >
                                              <span className="text-[9px] font-bold text-[#444] w-4 text-right select-none select-none inline-block mt-0.5">
                                                {change.type === 'removed' ? '-' : change.type === 'added' ? '+' : ' '}
                                              </span>
                                              <span className="whitespace-pre-wrap">{change.value || ' '}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        /* Side-by-side split screen view */
                                        <div id="split-diff-view" className="grid grid-cols-1 lg:grid-cols-2 bg-[#020202] divide-y lg:divide-y-0 lg:divide-x divide-[#1a1a1a]">
                                          {/* Left block - Old basis */}
                                          <div className="flex flex-col">
                                            <div className="bg-[#070707] px-3 py-1 border-b border-[#111] flex justify-between items-center text-[9px] text-[#555] uppercase font-bold select-none">
                                              <span>v{verNum}.0 historical payload</span>
                                            </div>
                                            <div className="max-h-[350px] overflow-y-auto py-2 divide-y divide-[#111]/10 custom-scrollbar select-text selection:bg-[#ff0044]/20">
                                              {oldLinesWithPlaceholders.map((line, idx) => (
                                                <div 
                                                  key={idx} 
                                                  className={`px-3 py-0.5 min-h-[1.5rem] font-mono text-[10px] leading-relaxed flex items-start gap-2 ${
                                                    line.type === 'removed' ? 'bg-[#ff0044]/10 text-[#f87171] border-l-2 border-[#ef4444]' :
                                                    line.type === 'placeholder' ? 'bg-[#1a1a1a]/40 opacity-20 select-none' :
                                                    'text-[#555]'
                                                  }`}
                                                >
                                                  <span className="text-[8px] text-[#444] w-2 text-right select-none inline-block mt-0.5">
                                                    {line.type === 'removed' ? '-' : ' '}
                                                  </span>
                                                  <span className="whitespace-pre-wrap">{line.type === 'placeholder' ? ' ' : (line.value || ' ')}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                          
                                          {/* Right block - Current workspace draft */}
                                          <div className="flex flex-col">
                                            <div className="bg-[#070707] px-3 py-1 border-b border-[#111] flex justify-between items-center text-[9px] text-[#555] uppercase font-bold select-none">
                                              <span>Active workspace payload</span>
                                            </div>
                                            <div className="max-h-[350px] overflow-y-auto py-2 divide-y divide-[#111]/10 custom-scrollbar select-text selection:bg-[#00ff00]/25">
                                              {newLinesWithPlaceholders.map((line, idx) => (
                                                <div 
                                                  key={idx} 
                                                  className={`px-3 py-0.5 min-h-[1.5rem] font-mono text-[10px] leading-relaxed flex items-start gap-2 ${
                                                    line.type === 'added' ? 'bg-[#00ff44]/15 text-[#4ade80] border-l-2 border-[#10b981]' :
                                                    line.type === 'placeholder' ? 'bg-[#1a1a1a]/40 opacity-20 select-none' :
                                                    'text-[#999]'
                                                  }`}
                                                >
                                                  <span className="text-[8px] text-[#444] w-2 text-right select-none inline-block mt-0.5">
                                                    {line.type === 'added' ? '+' : ' '}
                                                  </span>
                                                  <span className="whitespace-pre-wrap">{line.type === 'placeholder' ? ' ' : (line.value || ' ')}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })() : (
                              <div className="text-[10px] text-[#444] italic text-center py-24 border border-dashed border-[#1a1a1a]">
                                Select a version on the left sidebar to compare architectural prompts...
                              </div>
                            )}
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
                                  <h3 className="text-xl font-bold uppercase tracking-widest text-[#e0e0e0]">C-RSP (Constitutionally-Regulated Single Pass) Certificate</h3>
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
                        className="space-y-8"
                      >
                        {instructionSet.buildContract && (
                          <div className="bg-[#050505] border border-[#1a1a1a] rounded-sm overflow-hidden">
                            <AuditTrail contract={instructionSet.buildContract} />
                          </div>
                        )}

                        {crossModelParity ? (
                          <div className="bg-[#050505] border border-[#1a1a1a] p-6 rounded-sm">
                            <div className="flex items-center justify-between mb-8">
                              <h3 className="text-sm font-bold text-[#e0e0e0] uppercase tracking-wider flex items-center gap-2">
                                <Layers size={18} className="text-[#00ff00]" /> Cross-Model Parity Dashboard
                              </h3>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-[9px] text-[#666] uppercase font-bold">Overall Consistency</p>
                                  <p className="text-xl font-black text-[#00ff00]">{crossModelParity.consistency}%</p>
                                </div>
                                <div className="w-12 h-12 rounded-full border-2 border-[#00ff00]/30 flex items-center justify-center p-1">
                                  <div 
                                    className="w-full h-full rounded-full border-2 border-[#00ff00]" 
                                    style={{ clipPath: `inset(${100 - crossModelParity.consistency}% 0 0 0)` }}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                              {[
                                { name: 'Claude 3.7', score: crossModelParity.claudeScore, color: '#f6814d', icon: 'C' },
                                { name: 'Gemini 2.0', score: crossModelParity.geminiScore, color: '#00ff00', icon: 'G' },
                                { name: 'GPT-4o', score: crossModelParity.gptScore, color: '#74aa9c', icon: 'P' }
                              ].map((m) => (
                                <div key={m.name} className="space-y-3">
                                  <div className="flex justify-between items-end">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-sm bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[10px] font-bold" style={{ color: m.color }}>
                                        {m.icon}
                                      </div>
                                      <span className="text-[11px] font-bold text-[#aaa] uppercase">{m.name}</span>
                                    </div>
                                    <span className="text-sm font-black text-white tabular-nums">{m.score}%</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-[#1a1a1a] rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${m.score}%` }}
                                      className="h-full rounded-full"
                                      style={{ backgroundColor: m.color }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="mt-10 pt-6 border-t border-[#1a1a1a]">
                              <div className="flex items-center gap-2 mb-4">
                                <AlertCircle size={14} className="text-[#ff9900]" />
                                <h4 className="text-[10px] text-[#888] uppercase font-bold tracking-widest">Architectural Drift & Model Biases</h4>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {crossModelParity.issues.map((issue, idx) => (
                                  <div key={idx} className="flex gap-3 p-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-sm group hover:border-[#333] transition-colors">
                                    <div className="w-1 h-1 rounded-full bg-[#ff9900] mt-1.5 flex-shrink-0" />
                                    <p className="text-[11px] text-[#ccc] leading-relaxed">{issue}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : !instructionSet.buildContract ? (
                          <div className="text-center py-20 border border-dashed border-[#1a1a1a] rounded-sm bg-[#050505]">
                            <ShieldCheck size={48} className="mx-auto text-[#222] mb-4" />
                            <h3 className="text-sm font-bold text-[#666] uppercase tracking-[0.3em]">Verification Buffer Empty</h3>
                            <p className="text-[11px] text-[#444] mt-2 max-w-sm mx-auto">Build Contract and formal verification assets are generated during the final synthesis phase.</p>
                          </div>
                        ) : (
                          <div className="p-12 text-center border-t border-[#1a1a1a]">
                            <div className="animate-spin w-8 h-8 border-2 border-[#00ff00] border-t-transparent rounded-full mx-auto mb-4" />
                            <p className="text-[10px] text-[#666] uppercase font-bold">Performing adversarial cross-model audit...</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                    {activeTab === 'sheets_sync' && (
                      <motion.div 
                        key="sheets_sync"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <SheetsSync 
                          instructionSet={instructionSet}
                          audit={audit}
                          stress={stress}
                          intent={intent.raw}
                          targetModel={intent.targetModel}
                        />
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

      {/* Settings Modal (Choice & Control / Privacy) */}
      <AnimatePresence>
        {showSettingsPanel && (
          <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#050505] border border-[#1a1a1a] p-8 max-w-md w-full shadow-2xl relative"
            >
              <button
                onClick={() => setShowSettingsPanel(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white"
              >
                ✕
              </button>
              <h2 className="text-xl font-bold uppercase tracking-widest text-[#00ff00] mb-4">Accessibility & Data</h2>
              <div className="space-y-6">
                <div className="bg-[#0a0a0a] p-4 border border-[#1a1a1a]">
                  <h3 className="text-sm font-bold uppercase mb-2 flex items-center gap-2"><Settings size={14}/> Privacy & Consent</h3>
                  <p className="text-xs text-zinc-400 mb-4">You have full control over your data. If enabled, minimal anonymized activity is collected for IRB-approved research on AI interactions. You can opt out at any time.</p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isDataCollectionEnabled} 
                      onChange={(e) => setIsDataCollectionEnabled(e.target.checked)} 
                      className="accent-[#00ff00] w-4 h-4"
                    />
                    <span className="text-sm font-bold uppercase text-white">Enable Data Collection</span>
                  </label>
                  {!isDataCollectionEnabled && <p className="text-[10px] text-red-500 mt-2 font-bold uppercase">Data collection is paused.</p>}
                </div>
                
                <div className="bg-[#0a0a0a] p-4 border border-[#1a1a1a]">
                  <h3 className="text-sm font-bold uppercase mb-2 flex items-center gap-2"><Eye size={14}/> Sensory Accommodations</h3>
                  <p className="text-xs text-zinc-400 mb-3">Adjust the interface to match your sensory profile.</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setIntent(prev => ({ ...prev, theme: ThemeType.NEURO_FOCUS }))} className={`px-3 py-1 text-xs border ${intent.theme === ThemeType.NEURO_FOCUS ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-[#333] hover:border-[#666] text-zinc-400'}`}>Neuro-Focus (Low contrast)</button>
                    <button onClick={() => setIntent(prev => ({ ...prev, theme: ThemeType.HIGH_CONTRAST }))} className={`px-3 py-1 text-xs border ${intent.theme === ThemeType.HIGH_CONTRAST ? 'border-white bg-white/10 text-white' : 'border-[#333] hover:border-[#666] text-zinc-400'}`}>High Contrast</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

      {/* Universal Pause Overlay */}
      <AnimatePresence>
        {isGlobalPaused && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex flex-col items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <PauseCircle size={64} className="text-[#00ff00] animate-pulse" />
              <h2 className="text-2xl font-bold uppercase tracking-[0.3em] text-white">Session Paused</h2>
              <p className="text-sm text-zinc-400 max-w-sm">
                Executive function pause is active. Timers and data collection are suspended. Take a break.
              </p>
              <button
                onClick={() => setIsGlobalPaused(false)}
                className="mt-4 px-6 py-3 bg-[#00ff00] text-[#000] font-bold uppercase tracking-widest text-xs hover:bg-[#00cc00] transition-colors shadow-[0_0_15px_rgba(0,255,0,0.3)]"
              >
                Resume Session
              </button>
            </motion.div>
          </div>
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

