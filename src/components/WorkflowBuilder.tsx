import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node
} from 'reactflow';
import 'reactflow/dist/style.css';
import { WorkflowStep, ModelType, UserIntent, ThemeType } from '../types';
import { auditIntent, stressTest, generateInstructionSet, generateWorkflow, getModelStrengths } from '../services/gemini';
import { Play, Plus, Trash2, GitMerge, CheckCircle2, AlertCircle, RefreshCw, Wand2, LayoutTemplate, SplitSquareHorizontal, Download, ArrowUp, ArrowDown, Save } from 'lucide-react';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { storage } from '../utils/storage';

const TEMPLATES = [
  {
    name: "SaaS MVP",
    description: "Full-stack SaaS application with auth, database, and billing.",
    steps: [
      { name: "Database Schema", intent: "Design the PostgreSQL database schema for a multi-tenant SaaS application.", targetModel: ModelType.GEMINI_1_5_PRO },
      { name: "Backend API", intent: "Create the Node.js/Express REST API based on the database schema.", targetModel: ModelType.CLAUDE_3_5_SONNET, dependsOnNames: ["Database Schema"] },
      { name: "Frontend UI", intent: "Build the React frontend dashboard connecting to the Backend API.", targetModel: ModelType.GEMINI_1_5_PRO, dependsOnNames: ["Backend API"] }
    ]
  },
  {
    name: "Content Pipeline",
    description: "Automated content generation and review pipeline.",
    steps: [
      { name: "Topic Ideation", intent: "Generate 5 trending topics in the AI space.", targetModel: ModelType.GEMINI_1_5_FLASH },
      { name: "Draft Generation", intent: "Write a comprehensive 1500-word article for each topic.", targetModel: ModelType.CLAUDE_3_OPUS, dependsOnNames: ["Topic Ideation"] },
      { name: "SEO Review", intent: "Review the drafts for SEO optimization and readability.", targetModel: ModelType.GEMINI_1_5_PRO, dependsOnNames: ["Draft Generation"] }
    ]
  },
  {
    name: "Data Analysis",
    description: "Data extraction, transformation, and visualization.",
    steps: [
      { name: "Data Extraction", intent: "Write a Python script to scrape data from a target website.", targetModel: ModelType.GEMINI_1_5_FLASH },
      { name: "Data Cleaning", intent: "Write a Pandas script to clean and normalize the extracted data.", targetModel: ModelType.CLAUDE_3_5_SONNET, dependsOnNames: ["Data Extraction"] },
      { name: "Visualization", intent: "Create a Streamlit dashboard to visualize the cleaned data.", targetModel: ModelType.GEMINI_1_5_PRO, dependsOnNames: ["Data Cleaning"] }
    ]
  },
  {
    name: "AI Agent Orchestration",
    description: "Multi-agent system with tool selection, function calling, and state persistence.",
    steps: [
      { name: "Tool Selection Logic", intent: "Design a routing mechanism that selects the optimal tool (Search, Calculator, Database) based on user query intent.", targetModel: ModelType.GEMINI_1_5_PRO },
      { name: "Function Calling Registry", intent: "Define a JSON schema-based function registry and the handling logic for tool execution results.", targetModel: ModelType.GPT_4O, dependsOnNames: ["Tool Selection Logic"] },
      { name: "State Management", intent: "Implement a state persistence layer and 'Scratchpad' memory for long-running agent tasks.", targetModel: ModelType.CLAUDE_3_5_SONNET, dependsOnNames: ["Function Calling Registry"] }
    ]
  }
];

export default function WorkflowBuilder() {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoPrompt, setAutoPrompt] = useState('');
  const [showAutoBuilder, setShowAutoBuilder] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(true);

  // Custom Templates database states
  const [customTemplates, setCustomTemplates] = useState<any[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // Load custom templates from IndexedDB
  useEffect(() => {
    const fetchTemplates = async () => {
      const loaded = await storage.getCustomTemplates();
      setCustomTemplates(loaded);
    };
    fetchTemplates();
  }, []);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  const onNodeDragStop = useCallback((_event: any, node: Node) => {
    setNodePositions(prev => ({
      ...prev,
      [node.id]: node.position
    }));
  }, []);

  const handleAutoArrange = useCallback(() => {
    if (steps.length === 0) return;

    const depths: Record<string, number> = {};
    const visiting = new Set<string>();

    const getDepth = (stepId: string): number => {
      if (stepId in depths) return depths[stepId];
      if (visiting.has(stepId)) return 0;
      visiting.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (!step || step.dependsOn.length === 0) {
        depths[stepId] = 0;
        visiting.delete(stepId);
        return 0;
      }

      let maxDepDepth = -1;
      for (const depId of step.dependsOn) {
        maxDepDepth = Math.max(maxDepDepth, getDepth(depId));
      }

      depths[stepId] = maxDepDepth + 1;
      visiting.delete(stepId);
      return depths[stepId];
    };

    steps.forEach(step => getDepth(step.id));

    const levelToNodes: Record<number, string[]> = {};
    steps.forEach(step => {
      const depth = depths[step.id] || 0;
      if (!levelToNodes[depth]) levelToNodes[depth] = [];
      levelToNodes[depth].push(step.id);
    });

    const newPositions: Record<string, { x: number; y: number }> = {};
    const heightPerNode = 130;
    const widthPerLevel = 260;

    Object.entries(levelToNodes).forEach(([levelStr, nodeIds]) => {
      const level = parseInt(levelStr, 10);
      const nodeCount = nodeIds.length;
      
      nodeIds.forEach((id, index) => {
        const totalColumnHeight = (nodeCount - 1) * heightPerNode;
        const x = 50 + level * widthPerLevel;
        const y = 150 + (index * heightPerNode) - (totalColumnHeight / 2);
        
        newPositions[id] = { x, y };
      });
    });

    setNodePositions(newPositions);
  }, [steps]);

  const unresolvedSteps = useMemo(() => {
    const unresolved = new Set<string>();
    const stepIds = new Set(steps.map(s => s.id));

    // 1. Check for missing referenced step IDs
    steps.forEach(step => {
      const hasMissing = step.dependsOn.some(depId => !stepIds.has(depId));
      if (hasMissing) {
        unresolved.add(step.id);
      }
    });

    // 2. Check for circular dependencies
    const hasCycle = (stepId: string, visited: Set<string>, stack: Set<string>): boolean => {
      if (stack.has(stepId)) return true;
      if (visited.has(stepId)) return false;

      visited.add(stepId);
      stack.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (step) {
        for (const depId of step.dependsOn) {
          if (hasCycle(depId, visited, stack)) {
            return true;
          }
        }
      }

      stack.delete(stepId);
      return false;
    };

    steps.forEach(step => {
      if (!unresolved.has(step.id)) {
        const visited = new Set<string>();
        const stack = new Set<string>();
        if (hasCycle(step.id, visited, stack)) {
          unresolved.add(step.id);
        }
      }
    });

    return unresolved;
  }, [steps]);

  // Sync ReactFlow with internal steps state
  useEffect(() => {
    // Check if we need to auto-calculate default positions for any nodes missing them
    const missingPosition = steps.some(step => !nodePositions[step.id]);
    
    if (missingPosition && steps.length > 0) {
      const depths: Record<string, number> = {};
      const visiting = new Set<string>();

      const getDepth = (stepId: string): number => {
        if (stepId in depths) return depths[stepId];
        if (visiting.has(stepId)) return 0;
        visiting.add(stepId);

        const step = steps.find(s => s.id === stepId);
        if (!step || step.dependsOn.length === 0) {
          depths[stepId] = 0;
          visiting.delete(stepId);
          return 0;
        }

        let maxDepDepth = -1;
        for (const depId of step.dependsOn) {
          maxDepDepth = Math.max(maxDepDepth, getDepth(depId));
        }

        depths[stepId] = maxDepDepth + 1;
        visiting.delete(stepId);
        return depths[stepId];
      };

      steps.forEach(step => getDepth(step.id));

      const levelToNodes: Record<number, string[]> = {};
      steps.forEach(step => {
        const depth = depths[step.id] || 0;
        if (!levelToNodes[depth]) levelToNodes[depth] = [];
        levelToNodes[depth].push(step.id);
      });

      const updatedPositions = { ...nodePositions };
      const heightPerNode = 130;
      const widthPerLevel = 260;

      Object.entries(levelToNodes).forEach(([levelStr, nodeIds]) => {
        const level = parseInt(levelStr, 10);
        const nodeCount = nodeIds.length;
        
        nodeIds.forEach((id, index) => {
          if (!updatedPositions[id]) {
            const totalColumnHeight = (nodeCount - 1) * heightPerNode;
            const x = 50 + level * widthPerLevel;
            const y = 150 + (index * heightPerNode) - (totalColumnHeight / 2);
            updatedPositions[id] = { x, y };
          }
        });
      });

      setNodePositions(updatedPositions);
      return;
    }

    const newNodes: Node[] = steps.map((step) => {
      const pos = nodePositions[step.id] || { x: 0, y: 0 };
      const isUnresolved = unresolvedSteps.has(step.id);
      return {
        id: step.id,
        position: pos,
        data: { 
          label: (
             <div className="flex flex-col gap-1 p-2">
                <div className="font-bold text-xs">{step.name}</div>
                <div className="text-[9px] text-[#aaa]">{step.targetModel}</div>
                <div className="text-[10px] mt-1 capitalize text-[#00ff00] font-mono flex items-center gap-1">
                  {step.status === 'running' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#0088ff] animate-pulse" />}
                  {step.status === 'completed' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00ff00]" />}
                  {step.status === 'failed' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff0055]" />}
                  {step.status === 'idle' && !isUnresolved && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#666]" />}
                  {isUnresolved && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff3333] animate-pulse" />}
                  <span className={isUnresolved ? 'text-[#ff4444] font-bold' : ''}>
                    {isUnresolved ? 'unresolved/loop' : step.status}
                  </span>
                </div>
             </div>
          )
        },
        type: 'default',
        style: {
          background: isUnresolved ? '#2a0c0e' : step.status === 'completed' ? '#041f0f' : step.status === 'failed' ? '#1f040f' : step.status === 'running' ? '#041124' : '#0a0a0a',
          border: `1px solid ${isUnresolved ? '#ff3333' : step.status === 'completed' ? '#00ff00' : step.status === 'failed' ? '#ff0055' : step.status === 'running' ? '#0088ff' : '#1d1d1d'}`,
          color: '#eee',
          borderRadius: '4px',
          padding: '5px',
          width: '180px'
        }
      };
    });

    const newEdges: Edge[] = [];
    steps.forEach(step => {
      step.dependsOn.forEach(depId => {
        const isEdgeError = unresolvedSteps.has(depId) || unresolvedSteps.has(step.id);
        newEdges.push({
          id: `e-${depId}-${step.id}`,
          source: depId,
          target: step.id,
          animated: !isEdgeError && (step.status === 'running' || step.status === 'completed'),
          style: { 
            stroke: isEdgeError ? '#ff3333' : step.status === 'completed' ? '#00ff00' : step.status === 'running' ? '#0088ff' : '#222', 
            strokeWidth: isEdgeError || step.status === 'completed' ? 2 : 1 
          }
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [steps, nodePositions, unresolvedSteps, setNodes, setEdges]);

  const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const handleAutoGenerate = async () => {
    if (!autoPrompt) return;
    setIsGenerating(true);
    try {
      const result = await generateWorkflow(autoPrompt);
      const newSteps: WorkflowStep[] = result.steps.map((s, i) => ({
        id: `step-${Date.now()}-${i}`,
        name: s.name,
        intent: s.intent,
        targetModel: s.targetModel,
        dependsOn: [], // We'll link these in the next pass
        status: 'idle'
      }));

      // Link dependencies
      result.steps.forEach((s, i) => {
        if (s.dependsOnNames && s.dependsOnNames.length > 0) {
          const depIds = s.dependsOnNames.map(depName => {
            const found = newSteps.find(ns => ns.name === depName);
            return found ? found.id : null;
          }).filter(Boolean) as string[];
          newSteps[i].dependsOn = depIds;
        }
      });

      setSteps(newSteps);
      setShowAutoBuilder(false);
      setAutoPrompt('');
    } catch (e) {
      console.error("Failed to auto-generate workflow", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const loadTemplate = (template: typeof TEMPLATES[0]) => {
    const newSteps: WorkflowStep[] = template.steps.map((s, i) => ({
      id: `step-${Date.now()}-${i}`,
      name: s.name,
      intent: s.intent,
      targetModel: s.targetModel,
      dependsOn: [],
      status: 'idle'
    }));

    template.steps.forEach((s, i) => {
      if (s.dependsOnNames && s.dependsOnNames.length > 0) {
        const depIds = s.dependsOnNames.map(depName => {
          const found = newSteps.find(ns => ns.name === depName);
          return found ? found.id : null;
        }).filter(Boolean) as string[];
        newSteps[i].dependsOn = depIds;
      }
    });

    setSteps(newSteps);
    setShowTemplates(false);
  };

  const addStep = () => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      name: `Step ${steps.length + 1}`,
      intent: '',
      targetModel: ModelType.GEMINI_1_5_PRO,
      dependsOn: [],
      status: 'idle'
    };
    setSteps([...steps, newStep]);
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim() || steps.length === 0) return;

    // Normalize the steps for templates
    const normalizedSteps = steps.map(s => ({
      name: s.name,
      intent: s.intent,
      targetModel: s.targetModel,
      dependsOnNames: s.dependsOn.map(depId => steps.find(found => found.id === depId)?.name).filter(Boolean) as string[]
    }));

    const newTemplate = {
      id: `template-${Date.now()}`,
      name: templateName.trim(),
      description: templateDescription.trim() || "Custom user pipeline configuration.",
      steps: normalizedSteps,
      createdAt: new Date().toISOString()
    };

    const updated = [...customTemplates, newTemplate];
    setCustomTemplates(updated);
    await storage.saveCustomTemplates(updated);

    // Reset fields
    setTemplateName('');
    setTemplateDescription('');
    setShowSaveTemplate(false);
  };

  const deleteCustomTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(updated);
    await storage.saveCustomTemplates(updated);
  };

  const loadCustomTemplate = (template: any) => {
    const newSteps: WorkflowStep[] = template.steps.map((s: any, i: number) => ({
      id: `step-${Date.now()}-${i}`,
      name: s.name,
      intent: s.intent,
      targetModel: s.targetModel,
      dependsOn: [],
      status: 'idle'
    }));

    template.steps.forEach((s: any, i: number) => {
      if (s.dependsOnNames && s.dependsOnNames.length > 0) {
        const depIds = s.dependsOnNames.map((depName: string) => {
          const found = newSteps.find(ns => ns.name === depName);
          return found ? found.id : null;
        }).filter(Boolean) as string[];
        newSteps[i].dependsOn = depIds;
      }
    });

    setSteps(newSteps);
    setShowTemplates(false);
  };

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    const reordered = [...steps];
    const temp = reordered[index];
    reordered[index] = reordered[index - 1];
    reordered[index - 1] = temp;
    setSteps(reordered);
  };

  const moveStepDown = (index: number) => {
    if (index === steps.length - 1) return;
    const reordered = [...steps];
    const temp = reordered[index];
    reordered[index] = reordered[index + 1];
    reordered[index + 1] = temp;
    setSteps(reordered);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id).map(s => ({
      ...s,
      dependsOn: s.dependsOn.filter(depId => depId !== id)
    })));
  };

  const updateStep = (id: string, updates: Partial<WorkflowStep>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const executeWorkflow = async () => {
    setIsRunning(true);
    
    // Reset status
    let currentSteps = steps.map(s => ({ ...s, status: 'idle' as const, result: undefined, error: undefined }));
    setSteps(currentSteps);

    const completed = new Set<string>();
    const failed = new Set<string>();

    let hasPending = true;
    while (hasPending) {
// Find steps ready to run (idle, and all dependencies are completed)
// AND also, ensure none of their dependencies failed. If a dependency failed, this step must also fail.
      const readySteps = currentSteps.filter(s => 
        s.status === 'idle' && 
        s.dependsOn.every(dep => completed.has(dep)) &&
        !s.dependsOn.some(dep => failed.has(dep))
      );

      // Immediately fail steps whose dependencies have failed
      const cascadedFailures = currentSteps.filter(s => 
        s.status === 'idle' && 
        s.dependsOn.some(dep => failed.has(dep))
      );
      
      if (cascadedFailures.length > 0) {
        currentSteps = currentSteps.map(s => 
          cascadedFailures.some(cf => cf.id === s.id) ? { ...s, status: 'failed', error: 'Dependency failed' } : s
        );
        cascadedFailures.forEach(s => failed.add(s.id));
        setSteps([...currentSteps]);
      }

      if (readySteps.length === 0) {
        const stuckSteps = currentSteps.filter(s => s.status === 'idle');
        if (stuckSteps.length > 0) {
          currentSteps = currentSteps.map(s => s.status === 'idle' ? { ...s, status: 'failed', error: 'Dependency unresolved or circular dependency' } : s);
          setSteps([...currentSteps]);
        }
        break;
      }

      // Run pending steps
      await Promise.all(readySteps.map(async (step) => {
        setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: 'running' } : s));

        try {
          let fullIntentRaw = step.intent;
          if (step.dependsOn.length > 0) {
             const depResults = step.dependsOn.map(depId => {
               // Must find from steps state just before resolving dependencies, but assuming completed they are fixed
               const depStep = currentSteps.find(s => s.id === depId);
               return `\n\n--- Output from ${depStep?.name} ---\n${depStep?.result?.finalPrompt}`;
             }).join('\n');
             fullIntentRaw += `\n\nContext from previous steps:${depResults}`;
          }

          const modelCapabilities = getModelStrengths(step.targetModel);
          // Dynamically adjust LCI Context Window and Compression based on model target
          let targetContext = 128000;
          let targetCompression = 4;
          
          if (step.targetModel === ModelType.GEMINI_1_5_PRO || step.targetModel === ModelType.GPT_O1_PREVIEW) {
            targetContext = 1000000;
            targetCompression = 16;
          } else if (step.targetModel === ModelType.CLAUDE_3_OPUS || step.targetModel === ModelType.CLAUDE_3_5_SONNET) {
            targetContext = 512000;
            targetCompression = 8;
          }

          const intentObj: UserIntent = {
            raw: fullIntentRaw + `\n\n[SYSTEM DIRECTIVE: Optimize purely for ${step.targetModel}. Architecture Strengths: ${modelCapabilities}]`,
            targetModel: step.targetModel,
            useLCI: true,
            lciConfig: { contextWindow: targetContext, compressionRatio: targetCompression },
            highRisk: false,
            theme: ThemeType.DARK
          };

          const auditRes = await auditIntent(intentObj);
          const stressRes = await stressTest(intentObj, auditRes);
          const instructionRes = await generateInstructionSet(intentObj, stressRes, []);

          setSteps(prev => {
             const updated = prev.map(s => s.id === step.id ? { ...s, status: 'completed' as const, result: instructionRes } : s);
             currentSteps = updated; // local cache update for next iteration
             return updated;
          });
          completed.add(step.id);
        } catch (err) {
          setSteps(prev => {
             const updated = prev.map(s => s.id === step.id ? { ...s, status: 'failed' as const, error: String(err) } : s);
             currentSteps = updated; // local cache update for next iteration
             return updated;
          });
          failed.add(step.id);
        }
      }));
    }

    setIsRunning(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    let y = 10;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Workflow Execution Report", 10, y);
    y += 10;

    steps.filter(s => s.status === 'completed').forEach(s => {
      if (y > 270) { doc.addPage(); y = 10; }
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`Step: ${s.name}`, 10, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      
      const splitIntent = doc.splitTextToSize(`Intent: ${s.intent}`, 190);
      doc.text(splitIntent, 10, y);
      y += (splitIntent.length * 5) + 5;
      
      if (s.result?.finalPrompt) {
        if (y > 270) { doc.addPage(); y = 10; }
        const splitResult = doc.splitTextToSize(`Output:\n${s.result.finalPrompt}`, 190);
        
        let startIdx = 0;
        while (startIdx < splitResult.length) {
          const linesPerPage = Math.floor((280 - y) / 5);
          const block = splitResult.slice(startIdx, startIdx + linesPerPage);
          doc.text(block, 10, y);
          y += (block.length * 5);
          startIdx += linesPerPage;
          if (startIdx < splitResult.length) {
            doc.addPage();
            y = 10;
          }
        }
      }
      y += 10;
    });
    
    doc.save("workflow-report.pdf");
  };

  const exportToZip = async () => {
    const zip = new JSZip();
    
    steps.filter(s => s.status === 'completed').forEach(s => {
      const content = `Step: ${s.name}\n\nIntent:\n${s.intent}\n\nTarget Model: ${s.targetModel}\n\nOutput:\n${s.result?.finalPrompt || ''}`;
      // Clean filename
      const filename = `${s.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      zip.file(filename, content);
    });
    
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workflow-outputs.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-[#0f0f0f] border border-[#1a1a1a] p-4 rounded-sm gap-4">
        <div className="flex items-center gap-3 text-[#0088ff]">
          <GitMerge size={24} className="flex-shrink-0" />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest">Workflow Builder</h2>
            <p className="text-[10px] text-[#666]">Chain prompts and define dependencies for complex generation pipelines.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <button 
            onClick={() => setShowTemplates(true)}
            disabled={isRunning}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#e0e0e0] text-xs font-bold uppercase hover:bg-[#222] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <LayoutTemplate size={14} /> Templates
          </button>
          <button 
            onClick={() => setShowAutoBuilder(true)}
            disabled={isRunning}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#e0e0e0] text-xs font-bold uppercase hover:bg-[#222] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <Wand2 size={14} /> Auto-Generate
          </button>
          <button 
            onClick={() => setShowSaveTemplate(!showSaveTemplate)}
            disabled={isRunning || steps.length === 0}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#0088ff] text-xs font-bold uppercase hover:bg-[#222] border border-[#0088ff]/10 hover:border-[#0088ff]/30 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
            title="Save your current workflow pipeline as a reusable template to IndexedDB"
          >
            <Save size={14} /> Save Template
          </button>
          {steps.some(s => s.status === 'completed') && (
            <>
              <button 
                onClick={exportToPDF}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#e0e0e0] text-xs font-bold uppercase hover:bg-[#222] transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download size={14} /> PDF
              </button>
              <button 
                onClick={exportToZip}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#e0e0e0] text-xs font-bold uppercase hover:bg-[#222] transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download size={14} /> ZIP
              </button>
            </>
          )}
          <button 
            onClick={addStep}
            disabled={isRunning}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#e0e0e0] text-xs font-bold uppercase hover:bg-[#222] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <Plus size={14} /> Add Step
          </button>
          {unresolvedSteps.size > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[#2f0c0d] border border-[#ff3333]/30 rounded-sm text-[10px] text-[#ff3333] font-bold uppercase tracking-wider animate-pulse">
              <AlertCircle size={12} /> Graph Errors Detected
            </div>
          )}
          <button 
            onClick={executeWorkflow}
            disabled={isRunning || steps.length === 0 || unresolvedSteps.size > 0}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 text-xs font-bold uppercase transition-colors whitespace-nowrap cursor-pointer ${
              unresolvedSteps.size > 0 
                ? 'bg-[#1a1a1a] text-[#555] border border-[#ff3333]/15 cursor-not-allowed'
                : 'bg-[#0088ff] text-[#000] hover:bg-[#0066cc] disabled:opacity-50'
            }`}
            title={unresolvedSteps.size > 0 ? "Resolve all graph conflicts and loops before running" : "Execute the workflow chain"}
          >
            {isRunning ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {isRunning ? 'Executing...' : 'Run Workflow'}
          </button>
          <button 
            onClick={() => setShowVisualizer(!showVisualizer)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#e0e0e0] text-xs font-bold uppercase hover:bg-[#222] transition-colors whitespace-nowrap cursor-pointer"
          >
            <SplitSquareHorizontal size={14} /> Toggle Graph
          </button>
          {showVisualizer && steps.length > 0 && (
            <button 
              onClick={handleAutoArrange}
              disabled={isRunning}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#00ff00] border border-[#00ff00]/10 hover:border-[#00ff00]/30 text-xs font-bold uppercase hover:bg-[#222] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              title="Auto-arrange nodes in a clean tree database layout"
            >
              <GitMerge size={14} className="rotate-90" /> Auto-Arrange
            </button>
          )}
        </div>
      </div>

      {showSaveTemplate && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0f0f0f] border border-[#0088ff]/50 p-4 rounded-sm space-y-3"
        >
          <h3 className="text-xs font-bold text-[#0088ff] uppercase tracking-widest flex items-center gap-2">
            <Save size={14} /> Save Current Custom Pipeline as Template
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-[#666] uppercase font-bold">Template Name</label>
              <input 
                type="text" 
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="E.g., Production Deployment Audit Pipeline"
                className="bg-[#050505] border border-[#1a1a1a] p-2 text-xs text-[#e0e0e0] outline-none focus:border-[#0088ff]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-[#666] uppercase font-bold">Template Description</label>
              <input 
                type="text" 
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="E.g., 3-step pipeline for standardizing production code"
                className="bg-[#050505] border border-[#1a1a1a] p-2 text-xs text-[#e0e0e0] outline-none focus:border-[#0088ff]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button 
              onClick={handleSaveAsTemplate}
              disabled={!templateName.trim() || steps.length === 0}
              className="px-4 py-1.5 bg-[#0088ff] text-[#000] text-xs font-bold uppercase hover:bg-[#0066cc] disabled:opacity-50 transition-colors cursor-pointer"
            >
              Save to IndexedDB
            </button>
            <button 
              onClick={() => {
                setShowSaveTemplate(false);
                setTemplateName('');
                setTemplateDescription('');
              }}
              className="px-4 py-1.5 bg-[#1a1a1a] text-[#e0e0e0] text-xs font-bold uppercase hover:bg-[#222] transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {showVisualizer && steps.length > 0 && (
         <div className="h-[400px] w-full border border-[#1a1a1a] rounded-sm bg-[#050505]">
           <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStop={onNodeDragStop}
              fitView
              attributionPosition="bottom-left"
            >
              <MiniMap 
                nodeStrokeColor={(n) => {
                  if (n.style?.background === '#0a2a0a') return '#00ff00';
                  if (n.style?.background === '#2a0a0a') return '#ff0000';
                  return '#333';
                }}
                nodeColor={(n) => n.style?.background as string}
                nodeBorderRadius={2}
                maskColor="rgba(0,0,0,0.8)"
                style={{ backgroundColor: '#111' }}
              />
              <Controls className="bg-[#111] fill-white border-[#333]" />
              <Background color="#333" gap={16} />
            </ReactFlow>
         </div>
      )}

      {showAutoBuilder && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0f0f0f] border border-[#0088ff] p-4 rounded-sm"
        >
          <h3 className="text-xs font-bold text-[#0088ff] uppercase tracking-widest mb-3 flex items-center gap-2">
            <Wand2 size={14} /> Auto-Generate Workflow
          </h3>
          <div className="flex gap-3">
            <input 
              type="text" 
              value={autoPrompt}
              onChange={(e) => setAutoPrompt(e.target.value)}
              placeholder="E.g., Build a complete marketing campaign with blog posts, tweets, and emails..."
              className="flex-1 bg-[#050505] border border-[#1a1a1a] p-2 text-xs text-[#e0e0e0] outline-none focus:border-[#0088ff]"
            />
            <button 
              onClick={handleAutoGenerate}
              disabled={isGenerating || !autoPrompt}
              className="px-4 py-2 bg-[#0088ff] text-[#000] text-xs font-bold uppercase hover:bg-[#0066cc] transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : 'Generate'}
            </button>
            <button 
              onClick={() => setShowAutoBuilder(false)}
              className="px-4 py-2 bg-[#1a1a1a] text-[#e0e0e0] text-xs font-bold uppercase hover:bg-[#222] transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {showTemplates && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0f0f0f] border border-[#1a1a1a] p-5 rounded-sm space-y-6"
        >
          <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-3">
            <h3 className="text-xs font-bold text-[#e0e0e0] uppercase tracking-widest flex items-center gap-2">
              <LayoutTemplate size={14} className="text-[#0088ff]" /> Template Gallery
            </h3>
            <button 
              onClick={() => setShowTemplates(false)}
              className="text-[#64748b] hover:text-[#e2e8f0] text-xs font-mono cursor-pointer"
            >
              [CLOSE]
            </button>
          </div>

          {/* Custom Saved Templates Section */}
          <div className="space-y-3">
            <h4 className="text-[10px] uppercase font-bold text-[#0088ff] tracking-wider">
              My Saved Templates ({customTemplates.length})
            </h4>
            {customTemplates.length === 0 ? (
              <p className="text-[10px] text-[#444] italic bg-[#050505] p-3 border border-[#1d1d1d] rounded-sm">
                No custom templates saved to IndexedDB yet. Define steps and click "Save Template" above to capture one.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {customTemplates.map((template) => (
                  <div 
                    key={template.id} 
                    className="bg-[#050505] border border-dashed border-[#0088ff]/20 p-4 rounded-sm hover:border-[#0088ff] cursor-pointer transition-colors group relative flex flex-col justify-between"
                    onClick={() => loadCustomTemplate(template)}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1.5 mb-1.5">
                        <h4 className="text-xs font-bold text-[#0088ff] truncate max-w-[80%]">{template.name}</h4>
                        <button
                          onClick={(e) => deleteCustomTemplate(template.id, e)}
                          className="text-[#555] hover:text-[#ff0055] transition-colors p-1"
                          title="Delete Custom Template"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <p className="text-[10px] text-[#888] mb-4 line-clamp-2">{template.description}</p>
                    </div>
                    <div className="text-[9px] text-[#555] uppercase flex items-center justify-between group-hover:text-[#0088ff] transition-colors pt-2 border-t border-[#111]">
                      <span className="flex items-center gap-1"><Plus size={10} /> Load ({template.steps.length} steps)</span>
                      <span className="text-[8px] text-[#333] font-mono">{new Date(template.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Presets Section */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] uppercase font-bold text-[#aaaaaa] tracking-wider">
              System Preset Templates ({TEMPLATES.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {TEMPLATES.map((template, idx) => (
                <div 
                  key={idx} 
                  className="bg-[#050505] border border-[#1a1a1a] p-4 rounded-sm hover:border-[#0088ff] cursor-pointer transition-colors group"
                  onClick={() => loadTemplate(template)}
                >
                  <h4 className="text-xs font-bold text-[#e0e0e0] group-hover:text-[#0088ff] transition-colors mb-2">{template.name}</h4>
                  <p className="text-[10px] text-[#888] mb-4 line-clamp-2">{template.description}</p>
                  <div className="text-[9px] text-[#444] uppercase flex items-center gap-1 group-hover:text-[#0088ff] transition-colors pt-2 border-t border-[#111]">
                    <Plus size={10} /> Use Template ({template.steps.length} steps)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <div className="space-y-4">
        {steps.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[#1a1a1a] rounded-sm">
            <GitMerge size={32} className="mx-auto text-[#333] mb-3" />
            <p className="text-xs text-[#666] uppercase tracking-widest">No steps defined</p>
            <p className="text-[10px] text-[#444] mt-1">Add a step to start building your workflow.</p>
          </div>
        ) : (
          steps.map((step, index) => {
            const isUnresolved = unresolvedSteps.has(step.id);
            return (
              <motion.div 
                key={step.id}
                initial={{ opacity: 0, y: 10 }}
                animate={
                  isUnresolved
                    ? {
                        opacity: 1,
                        y: 0,
                        borderColor: '#ff3333',
                        boxShadow: '0 0 16px rgba(255, 51, 51, 0.2)',
                        transition: { duration: 0.3 }
                      }
                    : step.status === 'completed'
                    ? { 
                        opacity: 1,
                        y: 0,
                        scale: [1, 1.015, 1],
                        borderColor: '#00ff00', 
                        boxShadow: '0 0 16px rgba(0, 255, 0, 0.15)',
                        transition: { duration: 0.6, ease: "easeOut" }
                      }
                    : step.status === 'running'
                    ? { 
                        opacity: 1,
                        y: 0,
                        borderColor: '#0088ff',
                        boxShadow: ['0 0 0px rgba(0,136,255,0)', '0 0 12px rgba(0,136,255,0.4)', '0 0 0px rgba(0,136,255,0)'],
                        transition: { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
                      }
                    : step.status === 'failed'
                    ? { opacity: 1, y: 0, borderColor: '#ff0055' }
                    : { opacity: 1, y: 0, borderColor: '#1a1a1a' }
                }
                className="bg-[#050505] border p-4 rounded-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[10px] font-bold text-[#888]">
                      {index + 1}
                    </div>
                    <input 
                      type="text" 
                      value={step.name}
                      onChange={(e) => updateStep(step.id, { name: e.target.value })}
                      className="bg-transparent border-b border-transparent hover:border-[#333] focus:border-[#0088ff] outline-none text-sm font-bold text-[#e0e0e0] px-1 py-0.5"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    {isUnresolved && (
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="flex items-center gap-1 px-2 py-0.5 bg-[#2f0c0d] border border-[#ff3333]/30 rounded-sm text-[9px] text-[#ff3333] font-bold uppercase tracking-wider"
                      >
                        <AlertCircle size={10} /> Unresolved Dependency / Loop
                      </motion.div>
                    )}
                    {step.status === 'running' && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    >
                      <RefreshCw size={14} className="text-[#0088ff]" />
                    </motion.div>
                  )}
                  {step.status === 'completed' && (
                    <motion.div
                      initial={{ scale: 0.3, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    >
                      <CheckCircle2 size={14} className="text-[#00ff00]" />
                    </motion.div>
                  )}
                  {step.status === 'failed' && (
                    <motion.div
                      initial={{ scale: 0.5 }}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.3 }}
                    >
                      <AlertCircle size={14} className="text-[#ff0000]" />
                    </motion.div>
                  )}
                  
                  {/* Step Reordering buttons */}
                  <div className="flex items-center bg-[#141414] p-1 border border-[#1d1d1d] rounded-sm gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveStepUp(index)}
                      disabled={isRunning || index === 0}
                      className={`p-1 rounded-sm transition-all ${
                        index === 0 
                          ? 'text-[#2a2a2a] cursor-not-allowed' 
                          : 'text-[#888] hover:text-[#0088ff] hover:bg-[#1f1f1f] cursor-pointer'
                      }`}
                      title="Move Step Up"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStepDown(index)}
                      disabled={isRunning || index === steps.length - 1}
                      className={`p-1 rounded-sm transition-all ${
                        index === steps.length - 1 
                          ? 'text-[#2a2a2a] cursor-not-allowed' 
                          : 'text-[#888] hover:text-[#0088ff] hover:bg-[#1f1f1f] cursor-pointer'
                      }`}
                      title="Move Step Down"
                    >
                      <ArrowDown size={11} />
                    </button>
                  </div>

                  <button 
                    onClick={() => removeStep(step.id)}
                    disabled={isRunning}
                    className="text-[#666] hover:text-[#ff0055] hover:bg-[#ff0055]/10 p-1.5 rounded-sm transition-colors disabled:opacity-50 cursor-pointer"
                    title="Remove step"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-3">
                  <div>
                    <label className="text-[10px] text-[#666] uppercase block mb-1">Intent / Prompt</label>
                    <textarea 
                      value={step.intent}
                      onChange={(e) => updateStep(step.id, { intent: e.target.value })}
                      disabled={isRunning}
                      className="w-full h-24 bg-[#0f0f0f] border border-[#1a1a1a] p-3 text-xs text-[#e0e0e0] outline-none focus:border-[#0088ff] resize-none disabled:opacity-50"
                      placeholder="Describe what this step should generate..."
                    />
                  </div>
                  {step.result && (
                    <div className="mt-2 p-3 bg-[#0a1a0a] border border-[#00ff00] rounded-sm">
                      <p className="text-[10px] text-[#00ff00] uppercase font-bold mb-1">Generated Output</p>
                      <p className="text-xs text-[#e0e0e0] line-clamp-3">{step.result.finalPrompt}</p>
                    </div>
                  )}
                  {step.error && (
                    <div className="mt-2 p-3 bg-[#1a0505] border border-[#ff0000] rounded-sm text-xs text-[#ff0000]">
                      {step.error}
                    </div>
                  )}
                  {isUnresolved && (
                    <div className="mt-2 p-3 bg-[#2f0c0d] border border-[#ff3333]/50 rounded-sm text-xs text-[#ff4444] space-y-1">
                      <div className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                        <AlertCircle size={12} /> Graph Conflict Detected
                      </div>
                      <p className="text-[#aaa] text-[11px] leading-relaxed">
                        This step references a missing step or forms a circular loop. Verify the checkboxes in "Depends On" to break potential cycles.
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-[#666] uppercase block mb-1">Execution Profile</label>
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
                          (profile === 'Fast' && (step.targetModel === ModelType.GEMINI_2_0_FLASH || step.targetModel === ModelType.GEMINI_1_5_FLASH)) ||
                          (profile === 'Deep' && step.targetModel === ModelType.GEMINI_1_5_PRO) ||
                          (profile === 'Audit' && step.targetModel === ModelType.GPT_O1_PREVIEW) ||
                          (profile === 'Compare' && (step.targetModel === ModelType.CLAUDE_3_7_SONNET || step.targetModel === ModelType.CLAUDE_3_5_SONNET)) ||
                          (profile === 'Export' && step.targetModel === ModelType.DEEPSEEK_R1);

                        return (
                          <button
                            key={profile}
                            type="button"
                            onClick={() => {
                              updateStep(step.id, { targetModel: modelMap[profile] });
                            }}
                            className={`px-2 py-1 text-[9px] font-bold uppercase transition-colors ${
                              isSelected 
                                ? 'bg-[#0088ff] text-[#000]' 
                                : 'bg-[#1a1a1a] text-[#888] hover:bg-[#222]'
                            }`}
                          >
                            {profile}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 p-2.5 bg-[#080808] border border-[#1a1a1a] rounded text-[10px] leading-relaxed text-[#bbb]">
                      {step.targetModel === ModelType.GEMINI_2_0_FLASH || step.targetModel === ModelType.GEMINI_1_5_FLASH ? (
                        <p>
                          <span className="font-bold text-[#fafafa] font-mono text-[9px] bg-[#1a1a1a] px-1 py-0.5 rounded-sm mr-1 border border-[#333]">🏃 FAST SPEED</span>
                          Runs this step at maximum velocity. Best for rapid parsing, minor edits, and simple instruction checks.
                        </p>
                      ) : step.targetModel === ModelType.GEMINI_1_5_PRO ? (
                        <p>
                          <span className="font-bold text-[#fafafa] font-mono text-[9px] bg-[#1a1a1a] px-1 py-0.5 rounded-sm mr-1 border border-[#333]">🧠 DEEP PROBLEM-SOLVING</span>
                          Evaluates complex requirements thoroughly. Best for key logic blocks requiring deep file parsing and multi-factor decisions.
                        </p>
                      ) : step.targetModel === ModelType.GPT_O1_PREVIEW ? (
                        <p>
                          <span className="font-bold text-[#fafafa] font-mono text-[9px] bg-[#1a1a1a] px-1 py-0.5 rounded-sm mr-1 border border-[#333]">🔍 QUALITY AUDITING</span>
                          Runs a rigorous evaluation of all step assets and parameters. Best for strict compliance or security diagnostics.
                        </p>
                      ) : step.targetModel === ModelType.CLAUDE_3_7_SONNET || step.targetModel === ModelType.CLAUDE_3_5_SONNET ? (
                        <p>
                          <span className="font-bold text-[#fafafa] font-mono text-[9px] bg-[#1a1a1a] px-1 py-0.5 rounded-sm mr-1 border border-[#333]">⚖️ DESIGN COMPARISON</span>
                          Provides high-quality code and layout synthesis. Excel for refactoring structures or producing clean script paradigms.
                        </p>
                      ) : step.targetModel === ModelType.DEEPSEEK_R1 ? (
                        <p>
                          <span className="font-bold text-[#fafafa] font-mono text-[9px] bg-[#1a1a1a] px-1 py-0.5 rounded-sm mr-1 border border-[#333]">📦 DETAILED EXPORTS</span>
                          Ensures output format is beautifully packed, aligned, and structured for export or generation handoffs.
                        </p>
                      ) : (
                        <p>
                          <span className="font-bold text-[#fafafa] font-mono text-[9px] bg-[#1a1a1a] px-1 py-0.5 rounded-sm mr-1 border border-[#333]">⚙️ CUSTOM</span>
                          Tailored pipeline instructions for specific execution.
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[10px] text-[#666] uppercase block mb-1">Depends On</label>
                    <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                      {steps.filter(s => s.id !== step.id).length === 0 ? (
                        <p className="text-[10px] text-[#444] italic">No other steps available.</p>
                      ) : (
                        steps.filter(s => s.id !== step.id).map(otherStep => (
                          <label key={otherStep.id} className="flex items-center gap-2 text-[10px] text-[#aaa] cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={step.dependsOn.includes(otherStep.id)}
                              disabled={isRunning}
                              onChange={(e) => {
                                const newDeps = e.target.checked 
                                  ? [...step.dependsOn, otherStep.id]
                                  : step.dependsOn.filter(id => id !== otherStep.id);
                                updateStep(step.id, { dependsOn: newDeps });
                              }}
                              className="accent-[#0088ff]"
                            />
                            {otherStep.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )})
        )}
      </div>
    </div>
  );
}
