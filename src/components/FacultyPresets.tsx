import { useState } from 'react';
import { BookOpen, FileText, MessageCircle, ClipboardCheck, Shield, Users, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

export interface Preset {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  intent: string;
  targetModel: string;
  category: 'assessment' | 'content' | 'policy' | 'support';
}

export const FACULTY_PRESETS: Preset[] = [
  {
    id: 'essay-prompt',
    title: 'Essay Prompt Designer',
    description: 'Craft clear, rigorous essay prompts with built-in rubric alignment and AI-use tier declarations.',
    icon: <FileText size={18} />,
    category: 'assessment',
    targetModel: 'gemini-1.5-pro',
    intent: `Design a college-level essay prompt for an [INSERT COURSE NAME] course that:

1. Uses the AI-Enhanced tier (students may use AI for grammar/structure but must generate original arguments)
2. Includes a clear thesis requirement marked as HUMAN-GENERATED ONLY
3. Specifies 3-5 credible sources with proper citation
4. Defines a 4-level rubric: Exemplary, Proficient, Developing, Beginning
5. Includes process documentation requirements (outline, draft stages)
6. Sets the tone as analytical and evidence-based
7. Provides 2-3 sample thesis statements as examples (not for student use)

The prompt should be scaffolded for first-generation college students and include a self-assessment checklist.`,
  },
  {
    id: 'rubric-generator',
    title: 'Rubric Generator',
    description: 'Generate AI-use-tiered rubrics with transparent criteria for any assignment type.',
    icon: <ClipboardCheck size={18} />,
    category: 'assessment',
    targetModel: 'gemini-1.5-pro',
    intent: `Create a complete assignment rubric for [INSERT ASSIGNMENT TYPE] with the following structure:

AI-USE TIER: [SELECT: AI-Assisted / AI-Enhanced / AI-Free]

CRITERIA (5 dimensions):
1. Content Knowledge / Understanding
2. Critical Thinking / Analysis
3. Organization / Structure
4. Communication / Mechanics
5. Process / Documentation

Each criterion must have:
- A brief description of what is being assessed
- 4 performance levels (Exemplary 4, Proficient 3, Developing 2, Beginning 1)
- Specific, observable indicators at each level
- A note on which levels permit AI assistance (if applicable)

The rubric should:
- Be copy-paste ready for syllabus inclusion
- Include a total points row
- Have space for instructor comments
- Be accessible to students with diverse learning needs`,
  },
  {
    id: 'discussion-builder',
    title: 'Discussion Question Builder',
    description: 'Create Socratic discussion questions optimized for 8-week term pacing.',
    icon: <MessageCircle size={18} />,
    category: 'content',
    targetModel: 'gemini-1.5-pro',
    intent: `Generate 5 discussion questions for Week [INSERT WEEK] of an 8-week [INSERT COURSE NAME] course.

Requirements:
1. Questions must build on previous weeks' content (scaffolded progression)
2. At least 2 questions should require citation of course materials
3. At least 1 question should be a "devil's advocate" position requiring students to defend a counter-argument
4. 1 question should connect course content to real-world application in West Texas / Permian Basin context
5. Each question should have a suggested response length (150-300 words)
6. Include peer response prompts (students must respond to 2 classmates)
7. Add a participation rubric (Initial Post + 2 Peer Responses = Full Credit)

The questions should be accessible to students with varying levels of prior subject knowledge.`,
  },
  {
    id: 'quiz-author',
    title: 'Quiz & Assessment Author',
    description: 'Design formative assessments with cognitive safety checks and clear learning targets.',
    icon: <BookOpen size={18} />,
    category: 'assessment',
    targetModel: 'gemini-2.0-flash',
    intent: `Create a [INSERT FORMAT: multiple choice / short answer / mixed] assessment for [INSERT COURSE NAME] covering [INSERT TOPICS].

ASSESSMENT SPECIFICATIONS:
- Total items: [INSERT NUMBER, e.g., 10-15]
- Time limit: [INSERT, e.g., 20-30 minutes]
- AI-Use Tier: AI-Free (independent demonstration required)

EACH ITEM MUST INCLUDE:
1. The question stem
2. Correct answer(s)
3. 3 plausible distractors (for MC items)
4. The specific learning objective being assessed
5. Bloom's taxonomy level (Remember, Understand, Apply, Analyze, Evaluate, Create)
6. A brief explanation of why the correct answer is correct

FORMATIVE FOCUS:
- Include 2 "metacognitive check" items asking students to explain their reasoning
- Add a self-reflection question at the end: "What concept from this assessment do you need to review further?"

The assessment should be rigorous but fair for community college students in an 8-week term.`,
  },
  {
    id: 'ai-policy',
    title: 'Syllabus AI Policy Writer',
    description: 'Generate course-specific AI use policies aligned with OC institutional standards.',
    icon: <Shield size={18} />,
    category: 'policy',
    targetModel: 'gemini-1.5-pro',
    intent: `Write a course-specific AI use policy for [INSERT COURSE NAME] that aligns with Odessa College's institutional framework.

POLICY STRUCTURE:
1. PHILOSOPHY STATEMENT (1 paragraph)
   - Frame AI as a tool for learning, not a replacement for thinking
   - Reference OC's commitment to academic integrity and student success

2. AI-USE TIERS (clear table)
   - AI-Free: Assignments where independent mastery must be demonstrated
   - AI-Enhanced: AI permitted for grammar, structure, citation formatting only
   - AI-Assisted: AI may be used as a collaborative tool with process documentation

3. ASSIGNMENT-SPECIFIC RULES
   - List each major assignment and its designated AI-use tier
   - Explain the rationale for each designation

4. CITATION REQUIREMENTS
   - How to cite AI tools when used
   - Consequences of uncited AI use

5. SUPPORT RESOURCES
   - Where students can get help understanding the policy
   - Tutoring center contact information

The tone should be supportive and educational, not punitive. The policy should be clear enough that a first-generation college student can understand it without confusion.`,
  },
  {
    id: 'tutoring-script',
    title: 'Tutoring Center Script',
    description: 'Create structured tutoring session guides aligned with course learning objectives.',
    icon: <Users size={18} />,
    category: 'support',
    targetModel: 'gemini-1.5-pro',
    intent: `Design a structured tutoring session guide for [INSERT SUBJECT] tutors at Odessa College's Learning Resource Center.

SESSION STRUCTURE (50 minutes):

OPENING (5 min):
- Greeting and rapport-building script
- Question: "What brought you in today?" with follow-up prompts
- Review of student's current assignment and course materials

DIAGNOSTIC (10 min):
- Quick assessment questions to identify knowledge gaps
- Script for distinguishing between "I don't understand the concept" vs "I don't understand the assignment"

INSTRUCTION (25 min):
- Socratic questioning sequence (do not give answers, guide discovery)
- Scaffolded practice problems with decreasing support
- Check-for-understanding prompts every 5 minutes

CLOSING (10 min):
- Summary: student explains what they learned in their own words
- Action items: what the student will do before next session
- Scheduling follow-up if needed

TUTOR GUIDELINES:
- Accessibility accommodations checklist
- When to refer to instructor vs. when to continue tutoring
- Documentation requirements for Supplemental Instruction tracking
- Cultural sensitivity reminders for OC's diverse student population`,
  },
];

interface FacultyPresetsProps {
  onSelectPreset: (preset: Preset) => void;
  isVisible: boolean;
  onClose: () => void;
}

export default function FacultyPresets({ onSelectPreset, isVisible, onClose }: FacultyPresetsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  if (!isVisible) return null;

  const categories = [
    { id: 'all', label: 'All Presets' },
    { id: 'assessment', label: 'Assessment' },
    { id: 'content', label: 'Content' },
    { id: 'policy', label: 'Policy' },
    { id: 'support', label: 'Support' },
  ];

  const filteredPresets = activeCategory === 'all'
    ? FACULTY_PRESETS
    : FACULTY_PRESETS.filter(p => p.category === activeCategory);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#2d3e50]/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#faf8f5] rounded-xl border border-[#e8e2d8] shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#e8e2d8] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#2d3e50] rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#c6a679]" />
            </div>
            <div>
              <h2 
                className="text-lg font-bold text-[#2d3e50]"
                style={{ fontFamily: 'var(--font-crimson), Georgia, serif' }}
              >
                Faculty Prompt Lab
              </h2>
              <p className="text-xs text-[#8b7347]">Pre-built templates for Odessa College instruction</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-[#999] hover:text-[#2d3e50] transition-colors text-sm"
          >
            Close
          </button>
        </div>

        {/* Category Filter */}
        <div className="px-6 pt-4 flex gap-2 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                activeCategory === cat.id
                  ? 'bg-[#2d3e50] text-white'
                  : 'bg-[#f5f0e8] text-[#555] hover:bg-[#e8e2d8]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Presets List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredPresets.map(preset => (
            <div 
              key={preset.id}
              className="border border-[#e8e2d8] rounded-lg bg-white overflow-hidden transition-all hover:border-[#c6a679]"
            >
              <button
                onClick={() => setExpandedId(expandedId === preset.id ? null : preset.id)}
                className="w-full p-4 flex items-center gap-4 text-left"
              >
                <div className="w-9 h-9 bg-[#c6a679]/15 rounded-lg flex items-center justify-center text-[#c6a679] flex-shrink-0">
                  {preset.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[#2d3e50] text-sm">{preset.title}</h3>
                  <p className="text-xs text-[#666] truncate">{preset.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-[#8b7347] bg-[#c6a679]/10 px-2 py-0.5 rounded">
                    {preset.category}
                  </span>
                  {expandedId === preset.id ? <ChevronUp size={16} className="text-[#999]" /> : <ChevronDown size={16} className="text-[#999]" />}
                </div>
              </button>
              
              {expandedId === preset.id && (
                <div className="px-4 pb-4">
                  <div className="bg-[#faf8f5] border border-[#e8e2d8] rounded-lg p-4 mb-3">
                    <p className="text-xs text-[#8b7347] uppercase tracking-wider mb-2 font-semibold">Prompt Preview</p>
                    <pre className="text-xs text-[#444] whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto">
                      {preset.intent}
                    </pre>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#999]">Model: <span className="text-[#2d3e50] font-medium">{preset.targetModel}</span></span>
                    <button
                      onClick={() => onSelectPreset(preset)}
                      className="bg-[#2d3e50] hover:bg-[#3d5060] text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2"
                    >
                      <Sparkles size={14} />
                      Use This Template
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#e8e2d8] bg-[#faf8f5] rounded-b-xl">
          <p className="text-xs text-[#999] text-center">
            Select a template to pre-fill your intent. Customize the bracketed [INSERT] fields before generating.
          </p>
        </div>
      </div>
    </div>
  );
}
