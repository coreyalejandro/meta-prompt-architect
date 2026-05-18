import { useState } from 'react';
import { X, FileText, BookOpen, MessageSquare, HelpCircle, Shield, Users } from 'lucide-react';

export interface FacultyPreset {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  intent: string;
  targetModel: string;
}

export const FACULTY_PRESETS: FacultyPreset[] = [
  {
    id: 'essay-prompt',
    title: 'Essay Assignment Prompt',
    category: 'Writing',
    description: 'AI-ready essay prompt with clear rubric, AI-use tier, and cognitive scaffolding for students.',
    icon: <FileText size={18} />,
    targetModel: 'gemini-1.5-pro',
    intent: `Create a college-level essay assignment prompt for [COURSE NAME] on the topic of [TOPIC].

Requirements:
- Clear thesis requirement (human-generated, AI not permitted for this section)
- AI-use tier: AI-ENHANCED — students may use AI for grammar, outline organization, and citation formatting ONLY
- Word count: 1,000–1,500 words
- Include a 5-criterion rubric (thesis, evidence, organization, mechanics, citations)
- Include a process documentation requirement (outline + rough draft + revision log)
- Include a self-assessment checklist
- Language must be accessible to neurodivergent learners (plain language, no ambiguous instructions)
- Make all expectations explicit — no implied conventions`
  },
  {
    id: 'rubric-builder',
    title: 'Rubric Builder',
    category: 'Assessment',
    description: 'Generate a complete, leveled rubric for any assignment type with AI-use tiers clearly defined.',
    icon: <BookOpen size={18} />,
    targetModel: 'gemini-1.5-pro',
    intent: `Build a detailed grading rubric for [ASSIGNMENT TYPE] in [COURSE NAME].

Requirements:
- 4 performance levels: Exemplary, Proficient, Developing, Beginning
- 5–7 assessment dimensions relevant to the assignment type
- Each dimension must include: point range, behavioral descriptors, and example evidence
- Include an AI-use tier declaration for each dimension (AI-Free / AI-Enhanced / AI-Assisted)
- Include a feedback section template for instructors
- Rubric must be screen-reader accessible (table format with clear headers)
- Total points: 100
- Output as a complete, copy-paste-ready document`
  },
  {
    id: 'discussion-prompt',
    title: 'Discussion Board Prompt',
    category: 'Engagement',
    description: 'Structured discussion prompt that drives critical thinking with clear participation expectations.',
    icon: <MessageSquare size={18} />,
    targetModel: 'gemini-2.0-flash',
    intent: `Create a structured online discussion board prompt for [COURSE NAME] on [TOPIC].

Requirements:
- Opening question that requires critical analysis, not just recall
- 3 follow-up prompts for deeper engagement
- AI-use policy: AI NOT permitted for initial post; AI-Enhanced permitted for reply responses
- Participation requirements: 1 original post (250–300 words) + 2 substantive peer replies
- Grading criteria (10 points): content quality (6), engagement quality (2), timeliness (2)
- Include sentence starters for neurodivergent or ELL students
- Include a "what not to do" section to prevent shallow responses
- Accessible, plain-language instructions throughout`
  },
  {
    id: 'quiz-generator',
    title: 'Quiz / Knowledge Check',
    category: 'Assessment',
    description: 'Generate a fair, bias-checked quiz with multiple question formats and clear answer keys.',
    icon: <HelpCircle size={18} />,
    targetModel: 'gemini-1.5-pro',
    intent: `Generate a 10-question knowledge check for [COURSE NAME] covering [TOPIC/UNIT].

Requirements:
- Mix of question types: 4 multiple-choice, 3 short answer, 2 true/false with justification, 1 scenario-based
- Each question tied to a specific learning objective
- Bloom's Taxonomy distribution: 30% recall, 40% comprehension/application, 30% analysis/synthesis
- Include complete answer key with rationale for each correct answer
- Flag any questions that may contain cultural bias or ambiguity
- AI-use policy: This is an AI-Free assessment — all responses must be student-generated
- Include accessibility note: quiz should be screen-reader compatible and allow extended time
- Avoid trick questions; all ambiguity must be eliminated`
  },
  {
    id: 'ai-policy',
    title: 'Course AI-Use Policy',
    category: 'Policy',
    description: 'Generate a fair, transparent course-level AI-use policy aligned with the Instructional Integrity Framework.',
    icon: <Shield size={18} />,
    targetModel: 'gemini-1.5-pro',
    intent: `Draft a comprehensive AI-use policy for [COURSE NAME] at [INSTITUTION NAME].

Requirements:
- 3-tier structure: AI-Free assignments, AI-Enhanced assignments, AI-Assisted assignments
- Clear definitions of each tier with concrete examples
- Explicit list of permitted AI tools (e.g., grammar checkers, citation formatters)
- Explicit list of prohibited AI uses (e.g., generating thesis statements, writing body paragraphs)
- Academic integrity consequences section
- Student disclosure requirement: students must document any AI use
- Instructor transparency section: how AI was used in course design
- Plain-language throughout — accessible to all literacy levels
- Include an FAQ section (5 common student questions)
- Align with the Odessa College Instructional Integrity Framework principles`
  },
  {
    id: 'tutoring-script',
    title: 'AI Tutoring Script',
    category: 'Support',
    description: 'Socratic tutoring prompt that guides students to discover answers rather than providing them directly.',
    icon: <Users size={18} />,
    targetModel: 'gemini-2.0-flash',
    intent: `Create a Socratic AI tutoring system prompt for helping students with [SUBJECT/TOPIC] in [COURSE NAME].

Requirements:
- Persona: patient, encouraging academic tutor — never condescending
- Approach: Socratic method — guide students with questions, never give direct answers
- When a student is stuck: offer a hint, then a follow-up question, not the solution
- Accessibility: adjust language complexity based on student's demonstrated level
- For math/logic: always ask the student to show their work before giving feedback
- Include explicit refusal to write essays, complete assignments, or take assessments for students
- Include a "check for understanding" prompt after each concept
- Trauma-informed language: avoid language that implies failure or shame
- End each session with a summary of what the student learned and next steps`
  }
];

interface FacultyPresetsProps {
  isVisible: boolean;
  onClose: () => void;
  onSelectPreset: (preset: FacultyPreset) => void;
}

const tierColors: Record<string, string> = {
  Writing: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Assessment: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Engagement: 'bg-green-500/20 text-green-300 border-green-500/30',
  Policy: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Support: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

export default function FacultyPresets({ isVisible, onClose, onSelectPreset }: FacultyPresetsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        className="bg-[#0f0f0f] border border-[#c6a679]/30 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        style={{ boxShadow: '0 0 60px rgba(198,166,121,0.12)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1a1a1a]">
          <div>
            <div className="text-[10px] text-[#c6a679] uppercase tracking-[0.3em] font-bold mb-1">
              OC Faculty Prompt Lab
            </div>
            <h2 className="text-xl font-bold text-white uppercase tracking-wider">
              Faculty Presets
            </h2>
            <p className="text-[12px] text-[#888] mt-1">
              Select a template to pre-fill your intent. Customize before building.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#666] hover:text-white transition-colors p-2"
            aria-label="Close faculty presets"
          >
            <X size={20} />
          </button>
        </div>

        {/* Preset List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {FACULTY_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="border border-[#1a1a1a] rounded-xl overflow-hidden hover:border-[#c6a679]/40 transition-colors"
            >
              <div
                className="flex items-start gap-4 p-4 cursor-pointer"
                onClick={() => setExpanded(expanded === preset.id ? null : preset.id)}
              >
                <div className="text-[#c6a679] mt-0.5 flex-shrink-0">{preset.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white uppercase tracking-wide">
                      {preset.title}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${tierColors[preset.category] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                      {preset.category}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#888] mt-1 leading-relaxed">
                    {preset.description}
                  </p>
                </div>
              </div>

              {expanded === preset.id && (
                <div className="px-4 pb-4 border-t border-[#1a1a1a] pt-3">
                  <div className="bg-[#050505] rounded-lg p-3 mb-3">
                    <div className="text-[10px] text-[#c6a679] uppercase tracking-widest mb-2 font-bold">
                      Intent Preview
                    </div>
                    <pre className="text-[11px] text-[#aaa] whitespace-pre-wrap leading-relaxed font-mono">
                      {preset.intent}
                    </pre>
                  </div>
                  <button
                    onClick={() => onSelectPreset(preset)}
                    className="w-full bg-[#c6a679] text-[#0f0f0f] py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-[#d4b88a] transition-colors rounded-lg"
                  >
                    Use This Template
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1a1a1a] text-center">
          <p className="text-[10px] text-[#555] uppercase tracking-widest">
            Customize any template after selecting · All presets follow OC Instructional Integrity Framework
          </p>
        </div>
      </div>
    </div>
  );
}
