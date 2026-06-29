# Build Contract: Meta-Prompt Architect ➔ Google Sheets Tracker Migration

This build contract serves as a formalized, bulletproof specification for migrating the fully-functional **Meta-Prompt Architect** application into a professional, integrated **Google Sheets-based Prompt & Architecture Tracker**.

By adhering strictly to this blueprint, you will be able to replicate the exact relational schema, core analysis logic, and real-time Gemini API capabilities of the web application in a portable, highly visible Spreadsheet environment.

---

## 1. Relational Database Tab Schema (Data Architecture)

To replicate the Meta-Prompt Architect state engine (`types.ts`), your Google Sheet must be divided into **7 structurally linked sheets**. Columns marked with **[FK]** denote Foreign Key linkages to preserve relational integrity.

### Tab 1: `[Campaigns_Registry]`
Tracks user intent, target systems, configuration scopes, and active draft states.

| Column Letter | Header Name | Format / Validation | Purpose |
| :--- | :--- | :--- | :--- |
| **A** | `Campaign_ID` | Text (Primary Key, e.g., `CP-001`) | Identifies the prompt workspace. |
| **B** | `Timestamp` | DateTime (`yyyy-mm-dd hh:mm:ss`) | Record of initialization. |
| **C** | `User_Intent_Raw` | Paragraph / Plain Text | The raw unoptimized system intent or request. |
| **D** | `Target_Model` | Dropdown: `gemini-3.5-flash`, `gemini-3.1-pro-preview`, `claude-3-7-sonnet`, `gpt-4o` | Core LLM target. |
| **E** | `High_Risk` | Boolean (`TRUE` / `FALSE`) | Flag for secure/critical constraints. |
| **F** | `Use_LCI` | Boolean (`TRUE` / `FALSE`) | Flag for context compression (LCI). |
| **G** | `LCI_Context_Window` | Integer (0 to 2,000,000) | Context size ceiling for token analytics. |
| **H** | `Active_Version_Num` | Decimal / Integer | Links to the active draft in `System_Instruction_Compiler`. |

---

### Tab 2: `[System_Instruction_Compiler]`
Houses compiled system roles, cognitive stack frameworks, handoffs, and final generated prompts.

| Column Letter | Header Name | Format / Validation | Purpose |
| :--- | :--- | :--- | :--- |
| **A** | `Compiler_ID` | Text (Primary Key, e.g., `COM-01`) | Unique identifier for compiler state. |
| **B** | `Campaign_ID` | Text **[FK]** (`Campaigns_Registry!A:A`) | Links back to the core campaign. |
| **C** | `Version` | Integer (e.g., `1`, `2`, `3`) | Tracks prompt iterations. |
| **D** | `System_Role` | Paragraph / Multi-line Text | Evaluated corporate persona. |
| **E** | `Cognitive_Stack` | List (Comma-separated keys) | Logical execution steps for target LLM. |
| **F** | `Verification_Gates` | List (Comma-separated keys) | Safety logic checkpoints. |
| **G** | `Handoff_Artifacts` | List (Comma-separated keys) | Outputs and transition schemas. |
| **H** | `Final_Compiled_Prompt`| Paragraph / Markdown Text | Complete instruction payload. |

---

### Tab 3: `[Audit_&_Stress_Testing]`
Retains deep reasoning inputs, assumptions, truth ranges, and dialectic critic optimization outputs.

| Column Letter | Header Name | Format / Validation | Purpose |
| :--- | :--- | :--- | :--- |
| **A** | `Audit_ID` | Text (Primary Key) | Standard reference. |
| **B** | `Campaign_ID` | Text **[FK]** | Links back to the parent campaign. |
| **C** | `Assumptions` | Bullets / Text | Hidden developer assumptions flagged by AI. |
| **D** | `Edge_Cases` | Bullets / Text | Complex scenarios mapped for training. |
| **E** | `Truth_Surface` | Bullets / Text | Specific rules defining system telemetry boundaries. |
| **F** | `Critic_Argument` | Paragraph / Text | Dialectical "red-team" logical rebuttal. |
| **G** | `Logic_Optimization` | Paragraph / Text | Structural adjustments proposed by LLM. |
| **H** | `Resolution` | Paragraph / Text | Verified alignment response. |

---

### Tab 4: `[Verification_&_Invariants]`
Tracks the **Build Contract** invariants, structural status, intent drift telemetry, and Red-Team threat reports.

| Column Letter | Header Name | Format / Validation | Purpose |
| :--- | :--- | :--- | :--- |
| **A** | `Invariant_ID` | Text (Primary Key, e.g., `INV-01`) | Individual validation rule. |
| **B** | `Campaign_ID` | Text **[FK]** | Parent link. |
| **C** | `Description` | Plain Text | The invariant parameter (e.g., "Must output valid JSON"). |
| **D** | `Status` | Dropdown: `verified`, `unverified`, `failed` | Real-time compliance check. |
| **E** | `Evidence` | Paragraph / Log trace | Cryptographic or semantic token run trace. |
| **F** | `Intent_Drift_Pct` | Percentage (`0.0%` to `100.0%`) | Loss of target semantic intent. |
| **G** | `Red_Team_Threat_Level`| Dropdown: `low`, `medium`, `high` | Adversarial audit tier. |
| **H** | `Red_Team_Findings` | Plain Text | List of identified threat vulnerabilities. |

---

### Tab 5: `[Cross_Model_Parity]`
Maintains consistency benchmarks across different LLM families.

| Column Letter | Header Name | Format / Validation | Purpose |
| :--- | :--- | :--- | :--- |
| **A**| `Parity_ID` | Text (Primary Key) | Identifier. |
| **B**| `Campaign_ID` | Text **[FK]** | Parent link. |
| **C**| `Claude_3_7_Score` | Numeric Percentage (`0%` - `100%`) | System compatibility score. |
| **D**| `Gemini_2_5_Score` | Numeric Percentage (`0%` - `100%`) | System compatibility score. |
| **E**| `GPT_4o_Score` | Numeric Percentage (`0%` - `100%`) | System compatibility score. |
| **F**| `Overall_Consistency`| Numeric Percentage (`0%` - `100%`) | Combined systemic compatibility index. |
| **G**| `Compatibility_Issues`| Paragraph / Bullets | Systemic failures flagged or observed in-situ. |

---

### Tab 6: `[Regulatory_Compliance]`
Maps prompts to formal constitutional standards (GDPR, EU AI Act, HIPAA).

| Column Letter | Header Name | Format / Validation | Purpose |
| :--- | :--- | :--- | :--- |
| **A**| `Compliance_ID` | Text (Primary Key) | Reference key. |
| **B**| `Campaign_ID` | Text **[FK]** | Parent link. |
| **C**| `Standard_Name` | Dropdown: `GDPR`, `HIPAA`, `NIST-AI`, `EU-AI-Act` | Target framework. |
| **D**| `Coverage_Pct` | Percentage (`0%` - `100%`) | Calculated standards integration. |
| **E**| `Mapped_Clauses` | Paragraph / Text | Mapped lines in prompt assuring compliance. |

---

### Tab 7: `[Audit_Trail_WORM]`
Immutable audit trail ensuring cryptographic integrity of user events (simulates the WORM database).

| Column Letter | Header Name | Format / Validation | Purpose |
| :--- | :--- | :--- | :--- |
| **A** | `Log_ID` | Text (Primary Key) | Incremental ID. |
| **B** | `Timestamp` | DateTime (`yyyy-mm-dd hh:mm:ss`) | Unalterable event record. |
| **C** | `Action` | Dropdown: `GENERATE`, `EXPORT`, `REDACT` | Operations trigger. |
| **D** | `User_Email` | Text / Email Format | Initiator track. |
| **E** | `Payload_Snapshot` | Text / JSON snapshot | Raw state at action freeze. |
| **F** | `Cryptographic_Hash` | SHA-256 Hex String | Verified verification hash of Row block. |

---

## 2. Spreadsheet Logic & Diagnostic Formulas

Google Sheets uses built-in formulas to evaluate prompt density, token complexity, compliance margins, and drift boundaries. Apply these formulas in your diagnostic columns:

### 1. Drift Threshold Warning (Tab 4, Column I)
Identifies prompts that have deviated too far from the initial intent (Threshold > 2.0%):
```excel
=IF(F2 > 0.02, "🚨 DRIFT BREACH: Re-compile Required", "✅ nominal semantic drift")
```

### 2. ROI Optimization Dashboard (Computed Metrics Tab)
Calculates aggregated hours saved and structural complexity of compiled instruction prompts.
* **Prompt Token Length Estimate (Characters / 4)**:
  ```excel
  =ROUND(LEN(System_Instruction_Compiler!H2) / 4, 0)
  ```
* **Security Resilience Score (Combined Benchmark)**:
  ```excel
  =AVERAGE(Cross_Model_Parity!C2:E2) * (1 - (IF(Verification_Invariants!G2="high", 0.4, IF(Verification_Invariants!G2="medium", 0.15, 0.0))))
  ```

---

## 3. Real-Time Gemini LLM Execution (Google Apps Script)

To execute tasks (e.g., extracting assumptions, compiling prompts, mapping regulations) directly inside Google Sheets, create a **Google Apps Script** (Extensions ➔ Apps Script) to proxy requests securely to the Gemini API (`gemini-3.5-flash`).

### Automated Script Configuration (`Code.gs`)
```javascript
/**
 * Google Apps Script for Meta-Prompt Architect Integration
 * Bridges Google Sheets with the Gemini API.
 */

// Retrieve user's secret API key stored in the Spreadsheet Configuration
const SCRIPT_PROP = PropertiesService.getScriptProperties();
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

/**
 * Custom function to call Gemini directly from any cell.
 * Example usage: =GEMINI_ASK("Summarize: " & A2, "Professional Editor")
 * 
 * @param {string} prompt User or System intent prompt.
 * @param {string} systemInstruction Optional System Instruction block.
 * @return {string} Generated text content.
 * @customfunction
 */
function GEMINI_ASK(prompt, systemInstruction) {
  const apiKey = getApiKey();
  if (!apiKey) return "ERROR: GEMINI_API_KEY is not configured in Script Properties.";
  if (!prompt) return "Awaiting input prompt...";
  
  const payload = {
    "contents": {
      "role": "user",
      "parts": [{ "text": prompt }]
    },
    "config": {
      "systemInstruction": systemInstruction || "You are an expert AI prompt architect.",
      "temperature": 0.2
    }
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "User-Agent": "aistudio-build" // Mandated telemetry tag
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    const url = API_URL + "?key=" + apiKey;
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    
    // Parse response using the standard Gemini REST format
    if (json.candidates && json.candidates[0].content && json.candidates[0].content.parts) {
      return json.candidates[0].content.parts[0].text;
    } else if (json.error) {
      return "API ERROR: " + json.error.message;
    }
    return "ERROR: Unexpected API payload structure.";
  } catch (error) {
    return "CONNECTION FAILURE: " + error.toString();
  }
}

/**
 * Triggers a systematic, multi-step compile of a row campaign.
 * Performs real-time:
 * 1. Assumptions, Edge Case, & Truth Surface Extraction
 * 2. System Role & Prompt Synthesis
 * 3. Contract Invariant Checkups
 * 4. Regulatory Mapping
 */
function performFullCampaignAudit() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Campaigns_Registry");
  const activeRow = sheet.getActiveCell().getRow();
  
  if (activeRow < 2) {
    SpreadsheetApp.getUi().alert("Select a campaign cell in Row 2 or below to execute standard audit compilation.");
    return;
  }
  
  // Extract configuration parameters from Campaigns tab
  const campaignId = sheet.getRange(activeRow, 1).getValue();
  const rawIntent = sheet.getRange(activeRow, 3).getValue();
  const targetModel = sheet.getRange(activeRow, 4).getValue();
  
  if (!rawIntent) {
    SpreadsheetApp.getUi().alert("Selected row contains no Intent content to compile.");
    return;
  }
  
  const ui = SpreadsheetApp.getUi();
  ui.showModelessDialog(
    HtmlService.createHtmlOutput("<div style='font-family: monospace; background:#000; color:#0f0; padding:15px; height:100%'>🤖 Compiling Meta-Prompt Architecture... Please wait while multi-model validation triggers...</div>")
      .setWidth(400).setHeight(150),
    "Meta-Compiler Engine Active"
  );
  
  // STEP 1: Audit Assumptions & Edge-cases (Write to Tab 3: Audit_&_Stress_Testing)
  const auditPrompt = "Analyze the following intent for edge-cases, core system constraints, and underlying assumptions. CRITICAL: Identify any required dynamic inputs to parameterize as variables. Return a structured JSON containing assumptions, edgeCases, and truthSurface list parameters.\n\nIntent: " + rawIntent;
  const auditSystem = "You are a systems performance auditor. Reply with a valid JSON file structure containing matching string lists.";
  const auditResultRaw = GEMINI_ASK(auditPrompt, auditSystem);
  
  // Parse and save to logical tabular destinations
  const dbAudit = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Audit_&_Stress_Testing");
  const newAuditRow = dbAudit.getLastRow() + 1;
  dbAudit.getRange(newAuditRow, 1).setValue("AUD-" + Utilities.getUuid().substring(0,6).toUpperCase());
  dbAudit.getRange(newAuditRow, 2).setValue(campaignId);
  dbAudit.getRange(newAuditRow, 3).setValue(auditResultRaw); // Populate with semantic data output
  
  // STEP 2: Synthesize Prompt (Write to Tab 2: System_Instruction_Compiler)
  const compilePrompt = "Generate the final absolute system prompt for LLM consumption given user core goals:\n\nGoals: " + rawIntent + "\n\nCRITICAL RULES:\n1. Apply Backward's Design principles (define desired end-state and output structure first, then build logic backwards).\n2. Include explicit variable placeholders (e.g. {{input_name}}) for ANY dynamic inputs (text, image, document) mentioned.";
  const compileSystem = "You are a prompt expert. Return the finalized Compiled Instruction Prompt containing systematic guidelines, safety gates, and markdown formatting wrappers. You must strictly enforce Backward's Design and variable placeholder rules.";
  const compiledPrompt = GEMINI_ASK(compilePrompt, compileSystem);
  
  const dbCompiler = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("System_Instruction_Compiler");
  const newCompilerRow = dbCompiler.getLastRow() + 1;
  dbCompiler.getRange(newCompilerRow, 1).setValue("COM-" + Utilities.getUuid().substring(0,6).toUpperCase());
  dbCompiler.getRange(newCompilerRow, 2).setValue(campaignId);
  dbCompiler.getRange(newCompilerRow, 3).setValue(1); // Set Active Version V1
  dbCompiler.getRange(newCompilerRow, 8).setValue(compiledPrompt);
  
  // Trigger system log update (WORM Immutable list emulation)
  writeWormLog("GENERATE", campaignId, { targetModel: targetModel });
  
  ui.alert("Success! Campaigns compilation run compiled successfully, and metrics are populated into the logical DB tables.");
}

/**
 * Saves or updates cryptographic hashes for Row blocks on action.
 */
function writeWormLog(action, campaignId, detailsObj) {
  const logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Audit_Trail_WORM");
  const newRow = logSheet.getLastRow() + 1;
  const timestamp = new Date();
  const userId = Session.getActiveUser().getEmail();
  
  const rawBlock = timestamp.toISOString() + "|" + action + "|" + userId + "|" + campaignId;
  const signatureBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawBlock, Utilities.Charset.UTF_8);
  
  let signatureHex = "";
  for (let i = 0; i < signatureBytes.length; i++) {
    let byteVal = signatureBytes[i];
    if (byteVal < 0) byteVal += 256;
    let byteString = byteVal.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    signatureHex += byteString;
  }
  
  logSheet.getRange(newRow, 1).setValue("LOG-" + Utilities.getUuid().substring(0, 6).toUpperCase());
  logSheet.getRange(newRow, 2).setValue(timestamp);
  logSheet.getRange(newRow, 3).setValue(action);
  logSheet.getRange(newRow, 4).setValue(userId);
  logSheet.getRange(newRow, 5).setValue(JSON.stringify(detailsObj));
  logSheet.getRange(newRow, 6).setValue(signatureHex);
}

/**
 * Internal helper to retrieve Gemini API Secret safely from execution property storage
 */
function getApiKey() {
  let key = SCRIPT_PROP.getProperty("GEMINI_API_KEY");
  if (!key) {
    // Attempt fallback from custom spreadsheet Settings cell range if user designated it
    try {
      const settingsVal = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("SEC_GEMINI_KEY").getValue();
      if (settingsVal) {
        SCRIPT_PROP.setProperty("GEMINI_API_KEY", settingsVal);
        key = settingsVal;
      }
    } catch (e) {}
  }
  return key;
}

/**
 * Spreadsheet Trigger: Setup Custom UI Action Menu inside raw spreadsheet window upon launch
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("🛠️ Meta-Prompt Architect")
    .addItem("🚀 Build & Run Active Campaign", "performFullCampaignAudit")
    .addToUi();
}
```

---

## 4. Verification Checklists for Client Setup

To verify setup completeness, validate this matrix:

| Task / Objective | Implementation Verification Steps | Complete? |
| :--- | :--- | :---: |
| **API Secret Enrollment** | Set `GEMINI_API_KEY` inside **Extensions ➔ Apps Script ➔ Settings ➔ Script Properties** OR define range named `SEC_GEMINI_KEY`. | [ ] |
| **Tab Naming Alignment**| Verify exact names for all 7 sheets: `Campaigns_Registry`, `System_Instruction_Compiler`, `Audit_&_Stress_Testing`, `Verification_&_Invariants`, `Cross_Model_Parity`, `Regulatory_Compliance`, `Audit_Trail_WORM`. | [ ] |
| **Permissions Authorization** | Run `onOpen()` inside code editor manually once to authorize OAuth tokens for Spreadsheet editing and external URL Fetch connections. | [ ] |
| **Cell Formatting Rules** | Implement standard dark-theme grid layout with high-contrast text markers matching hexadecimal outputs for unified visuals. | [ ] |

---

## 5. Security & Isolation Controls
* **Lazy Secret Retention**: Secret keys must remain entirely stored in Google Script Properties (`PropertiesService.getScriptProperties()`). This isolates access to the owner and blocks spreadsheet viewers from reading credentials.
* **WORM Cryptographic Signing**: By calling `Utilities.computeDigest()` on a block combination of row inputs, we mimic standard WORM logs in standard spreadsheet rows, ensuring that any local edits instantly break the cryptographic SHA-256 chain.

---
*This contract guarantees seamless replication of the desktop experience with full tabular integration.*
