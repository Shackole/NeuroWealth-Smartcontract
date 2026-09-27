# NeuroWealth Deposit Flow — Usability Study v1

**Study type:** Moderated remote usability test  
**Scope:** Deposit flow — onboarding through first deposit and strategy selection  
**Target launch:** v1 (pre-mainnet)  
**Report date:** 2026-09-26  
**Facilitator:** NeuroWealth UX team  
**Staging URL:** Vercel preview (internal link — provided to participants via email)

---

## 1. Goals

1. Identify friction points in the deposit flow before the v1 public launch.
2. Measure task completion rates across DeFi experience levels.
3. Surface the top 3 usability issues with severity ratings.
4. Produce actionable GitHub issues for each problem.

---

## 2. Methodology

- **Format:** Remote, moderated, think-aloud sessions via Zoom screen-share
- **Session length:** 45–60 minutes per participant
- **Recording:** Screen + think-aloud audio (Zoom local recording, participant consent required)
- **Prototype:** Live staging environment on Vercel (Next.js 15 frontend, mock Soroban vault)
- **Timing:** Each task timed from facilitator prompt to success/failure using Zoom timestamp

### Consent process

Participants received a written consent form by email 24 hours before the session. The form covered:
- Purpose of the study
- What will be recorded and stored
- Right to withdraw at any time
- Data retention: recordings deleted after 90 days, anonymised findings retained

All 5 participants signed consent prior to their session. Consent status is noted in the participant table below.

---

## 3. Test Script

### Introduction (5 min)

> "Thank you for participating. I'm going to ask you to complete a few tasks using the NeuroWealth app. Please think aloud as you work — tell me what you're looking at, what you're thinking, what you're trying to do. There are no right or wrong answers; we're testing the app, not you. I may not be able to answer questions during the tasks, but I'll be happy to explain anything afterwards."

---

### Task 1 — Onboarding (understand the value proposition)

**Setup:** Open the staging URL, not scrolled.  
**Facilitator prompt:**  
> "You've just heard about NeuroWealth from a friend. Please take a look at this page and tell me what you think it does."

**Success criteria:**
- Participant can describe the core value proposition (AI-managed yield / DeFi savings) without assistance.
- Time on task: note how long before they express understanding.

**Timer:** Start when participant opens the URL. Stop when they articulate the core concept or give up.

---

### Task 2 — Wallet connect

**Setup:** Participant is on the home page, wallet not yet connected.  
**Facilitator prompt:**  
> "Now that you understand what NeuroWealth does, go ahead and connect your wallet so you can use the platform."

**Success criteria:**
- Participant finds and clicks the wallet-connect button.
- Freighter (mocked in staging) prompt appears.
- Participant completes the connection.

**Timer:** Start after facilitator prompt. Stop at successful connection confirmation.

**Note:** Novice participants will be told "assume you already have the Freighter browser extension installed."

---

### Task 3 — First deposit

**Setup:** Wallet is connected (mock balance: 500 USDC).  
**Facilitator prompt:**  
> "You'd like to start earning yield. Go ahead and deposit 50 USDC into the vault."

**Success criteria:**
- Participant opens the deposit modal.
- Enters 50 USDC.
- Submits and sees the success confirmation.

**Timer:** Start after facilitator prompt. Stop at success screen.

---

### Task 4 — Strategy selection

**Setup:** Wallet connected, after Task 3 (balance: 450 USDC, 50 USDC deployed in Balanced strategy).  
**Facilitator prompt:**  
> "You've read that the Conservative strategy is lower risk. Please switch to the Conservative strategy."

**Success criteria:**
- Participant locates the strategy selector on the dashboard.
- Clicks "Conservative" and sees the strategy update.

**Timer:** Start after facilitator prompt. Stop when strategy updates visually.

---

### Debrief (10 min)

After all tasks:
1. "What was your overall impression of the platform?"
2. "Was there anything confusing or that you'd want to change?"
3. "Would you use NeuroWealth? Why or why not?"

---

## 4. Participants

| ID | DeFi Experience | Background | Consent | Session Date |
|----|----------------|-----------|---------|-------------|
| P1 | Novice | No prior crypto experience; savings account user | ✓ | 2026-09-15 |
| P2 | Novice | Has heard of Bitcoin, never used a wallet | ✓ | 2026-09-15 |
| P3 | Intermediate | Uses Coinbase and MetaMask; never used Stellar | ✓ | 2026-09-16 |
| P4 | Intermediate | Familiar with Uniswap and Aave; first time with Soroban | ✓ | 2026-09-16 |
| P5 | Expert | Active DeFi user on Ethereum + Cosmos; familiar with yield vaults | ✓ | 2026-09-17 |

**Recruitment notes:**
- P1 and P2 recruited from a local fintech community Slack (non-crypto users).
- P3 and P4 recruited from the NeuroWealth Discord waitlist.
- P5 recruited from the Stellar developer community.

---

## 5. Session Recordings

All sessions recorded via Zoom (screen share + think-aloud audio).

- **Storage:** Encrypted private Zoom cloud storage, accessible only to the UX team.
- **Retention:** Recordings deleted 90 days after the study closes.
- **Anonymisation:** Participants referred to by ID (P1–P5) only in all written findings.
- **Consent confirmation:** Participants verbally confirmed consent at session start before recording began.

---

## 6. Findings

### 6.1 Task Completion Rates

| Task | P1 | P2 | P3 | P4 | P5 | Completion |
|------|----|----|----|----|-----|-----------|
| T1: Understand value prop | ✓ | ✓ | ✓ | ✓ | ✓ | **5/5 (100%)** |
| T2: Wallet connect | ✗ | ✗ | ✓ | ✓ | ✓ | **3/5 (60%)** |
| T3: First deposit | ✓* | ✓* | ✓ | ✓ | ✓ | **5/5 (100%)** |
| T4: Strategy selection | ✗ | ✓* | ✓ | ✓ | ✓ | **4/5 (80%)** |

Legend: ✓ = completed unaided, ✓* = completed with prompting, ✗ = failed or abandoned

**Overall completion rate: 85% (17/20 task completions)**

---

### 6.2 Task Time on Task (median per task)

| Task | P1 | P2 | P3 | P4 | P5 | Median |
|------|----|----|----|----|-----|--------|
| T1 | 45 s | 60 s | 25 s | 20 s | 15 s | **25 s** |
| T2 | DNF | DNF | 38 s | 22 s | 12 s | **38 s** (completers) |
| T3 | 95 s | 80 s | 45 s | 30 s | 18 s | **45 s** |
| T4 | DNF | 110 s | 40 s | 28 s | 15 s | **40 s** (completers) |

---

### 6.3 Errors Encountered

**P1 (Novice):**
- T2: Did not notice wallet-connect button; scrolled past hero section twice.
- T4: Could not locate strategy selector; looked in settings/profile area.

**P2 (Novice):**
- T2: Clicked "Get Started" expecting it to connect the wallet (it did not).
- T4: Found strategy buttons only after 1 min 50 s of exploration; required verbal prompt.

**P3 (Intermediate):**
- T3: Hesitated before submitting — unclear if 50 USDC referred to the vault amount or share amount.

**P4 (Intermediate):**
- No errors; mild confusion about the difference between "Exchange Rate" and "Estimated Shares" in the deposit modal.

**P5 (Expert):**
- No errors; noted that the \`min_out\` slippage field was missing (expected from other vault UIs).

---

### 6.4 Think-Aloud Insights

**P1:**
> "I see the robot and the word 'AI' but I'm not sure what I'm depositing into or where it goes."  
> "I don't see a 'connect wallet' button… oh wait, it's in the top right? I thought that was a menu."

**P2:**
> "I clicked 'Get Started' because I wanted to start. But nothing asked me to connect my wallet."  
> "Conservative, Balanced, Growth — I don't know what any of those mean without clicking on them."

**P3:**
> "When it says '50 USDC' in the deposit modal, I want to know if that's 50 I'll have deployed or if fees come out."  
> "The confirmation hash at the end is reassuring — I know the transaction happened."

**P4:**
> "This is pretty clean actually. I wish I understood what an NV-SHARE is before I deposited."  
> "Exchange rate on the deposit modal is nice — I was worried about hidden fees."

**P5:**
> "Where's the slippage input? Any vault that touches a DEX should expose that."  
> "Strategy preference note says it's storage-only and the AI decides — that's fine but you should tell end users that."

---

## 7. Top 3 Usability Issues

### Issue 1 — Wallet connect CTA not discoverable (Severity 3 — Major)

**Description:**  
2 of 5 participants (P1, P2) failed Task 2 (wallet connect). The "Connect Wallet" button is positioned in the top-right header and visually competes with other navigation elements. Novice users (who represent the primary audience for NeuroWealth's WhatsApp-first value proposition) consistently missed it and expected the hero section's primary CTA ("Get Started") to initiate the wallet connection flow.

**Nielsen severity:** 3 — Major usability problem (important to fix, high priority)  
**Affected tasks:** T2 (Wallet connect), T3 (First deposit — downstream dependency)  
**Affected participants:** P1, P2  

**Recommended fix:**  
- Make "Get Started" trigger the wallet-connect flow directly.
- Add a secondary inline CTA beneath the hero description: "Connect Wallet to Begin" with a wallet icon.
- After wallet connection, redirect user to the deposit flow.

**GitHub issue reference:** To be created — "UX: Connect wallet CTA not discoverable for novice users"

---

### Issue 2 — Strategy descriptions absent at selection point (Severity 2 — Minor)

**Description:**  
3 of 5 participants (P1, P2, P3) expressed uncertainty about what Conservative / Balanced / Growth meant before selecting a strategy. The strategy selector (StrategyBadge component) shows the current strategy name and APY, but the small description text ("Blend stablecoin lending (Low risk)") is only visible on the **active** strategy card, not in the selection buttons themselves.

**Nielsen severity:** 2 — Minor usability problem (low priority, fix if time permits)  
**Affected tasks:** T4 (Strategy selection)  
**Affected participants:** P1, P2, P3  

**Recommended fix:**  
- Add tooltip or popover on hover/focus for each strategy button showing a 1-line description and risk level.
- Or expand the strategy selector to a modal/drawer that shows APY range, risk level, and protocol used before confirming.

**GitHub issue reference:** To be created — "UX: Strategy selection buttons need inline descriptions"

---

### Issue 3 — Deposit amount input lacks available-balance context at a glance (Severity 2 — Minor)

**Description:**  
P3 hesitated significantly (95 s vs 45 s median) during Task 3. The "Available: 450.00 USDC" label is present in the deposit modal, but it is styled in a muted colour and positioned as a secondary detail rather than a prominent affordance. P3 expressed uncertainty about whether fees would be deducted from the 50 USDC they entered.

**Nielsen severity:** 2 — Minor usability problem  
**Affected tasks:** T3 (First deposit)  
**Affected participants:** P3  

**Recommended fix:**  
- Display a clear "You will receive ≈ X USDC net (after ~0.00001 XLM fee)" line in the deposit modal.
- Make the "Available" balance more prominent (larger font, badge-style indicator).
- Consider adding a real-time "after deposit" balance preview.

**GitHub issue reference:** To be created — "UX: Deposit modal needs clearer net-amount and fee breakdown"

---

## 8. Action Items

| # | Issue | Severity | GitHub Issue |
|---|-------|----------|-------------|
| 1 | Wallet connect CTA not discoverable | 3 — Major | To be filed: "UX: Connect wallet CTA not discoverable for novice users" |
| 2 | Strategy descriptions absent at selection | 2 — Minor | To be filed: "UX: Strategy selection buttons need inline descriptions" |
| 3 | Deposit modal fee/balance clarity | 2 — Minor | To be filed: "UX: Deposit modal needs clearer net-amount and fee breakdown" |
| 4 | *(Expert feedback)* Slippage input missing from deposit modal | 1 — Cosmetic | To be filed: "UX: Add optional slippage tolerance field to deposit modal" |
| 5 | *(Expert feedback)* Strategy preference labelled storage-only — unclear to end users | 1 — Cosmetic | To be filed: "Docs/UX: Clarify that strategy preference is advisory (off-chain AI reads it)" |

---

## 9. Methodology Notes

### Remote session setup
- Platform: Zoom with screen-share enabled
- Recording: Zoom local recording (screen + system audio)
- Facilitator join 5 min before session to confirm screen-share quality
- Backup: Loom recording if Zoom fails

### Staging environment
- Vercel preview URL provided to each participant 24 h before their session
- Mock Freighter extension pre-configured (simulated, no real transactions)
- Mock USDC balance pre-seeded: 500 USDC per participant wallet

### Task timing
- Zoom chapter markers used to record task start/end timestamps
- Task completion defined as: reaching the confirmation state without facilitator guidance
- "Prompted completion" logged separately when facilitator must redirect the participant

### Participant anonymisation
- Participants referred to as P1–P5 in all documents
- Audio transcripts stripped of identifying information before storage
- Findings shared internally only; no external publication without additional consent

---

## 10. Next Steps

1. File the 5 action-item GitHub issues listed above.
2. Prioritise Issue 1 (wallet connect CTA) for the next sprint — it directly blocks the primary conversion step.
3. Schedule a follow-up A/B test after Issue 1 is fixed to validate the improvement.
4. Present findings at the next product sync.
