<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/34d58bd0-0f42-4058-b4ab-265711ccde10

## OC Faculty Prompt Lab

This app has been upgraded with Odessa College institutional branding as part of the [AI-Augmented Instructional Integrity Framework](https://github.com/coreyalejandro/instructional-integrity-gemini-ui).

**Live OC Demo:** Append `?mode=odessa` to any deployment URL to trigger the full OC experience — branded splash screen, faculty preset templates, and the navy/gold theme.

### What the OC Mode Shows

- **OC Faculty Prompt Lab splash screen** — homecoming narrative framing the tool as faculty professional development infrastructure
- **6 Faculty Preset Templates** — one-click fill for essay prompts, rubric generation, discussion questions, quizzes, AI policies, and tutoring scripts
- **OC Navy/Gold Theme** — Odessa College institutional colors (navy `#2d3e50`, gold `#c6a679`) replacing the default cyberpunk palette

### Screenshots

| Default View | OC Faculty Mode (`?mode=odessa`) |
|---|---|
| *(Dark cyberpunk interface with neon green accents)* | *(Warm cream background, navy header, OC gold buttons)* |

### OC Brand Files

| File | Purpose |
|------|---------|
| `src/components/FacultyPresets.tsx` | 6 faculty use-case templates |
| `src/components/OCSplashScreen.tsx` | Branded welcome splash |
| `src/index.oc-theme.css` | Navy/gold theme override layer |

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
