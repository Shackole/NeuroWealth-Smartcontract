# First Depositor Usability Study

**Related issue:** [#507](https://github.com/Shackole/NeuroWealth-Smartcontract/issues/507)  
**Scope:** wallet connection, network selection, amount review, deposit confirmation, and withdrawal understanding.

This protocol is ready for a moderator to run with 5–7 first-time depositors.
No real funds or production credentials are needed. Use a local prototype or
Stellar testnet with test assets and a disposable wallet. Do not ask participants
to share recovery phrases, secret keys, or personal financial information.

## Before each session

1. Confirm the build and testnet environment are available; reset the demo wallet
   and clear participant-specific data.
2. Ask for consent to take notes. Do not record audio, video, wallet addresses,
   or screen contents unless the participant gives separate informed consent.
3. Explain that this is a usability review, not a test of the participant, and
   that they can stop at any time.
4. Record only an anonymous participant ID, session date, device class, and
   moderator initials.

## Moderator introduction

“We’re reviewing how clear the deposit and withdrawal flow is. Please say what
you expect to happen as you go. Use only the demo wallet and test assets. You can
stop or skip any task, and we will not ask for your secret key or recovery
phrase.”

## Tasks

Give one task at a time. Do not coach unless the participant is blocked; record
the prompt and any assistance provided.

1. **Connect:** Connect the demo wallet and explain which account is connected.
2. **Network:** Select or confirm the intended test network. Explain how you
   would notice that the wrong network is active.
3. **Review an amount:** Enter a small test amount and describe the asset,
   precision, fee estimate, and resulting balance shown before submission.
4. **Confirm a deposit:** Review and submit the test deposit. Explain what the
   confirmation state means and how you would know whether it completed.
5. **Understand withdrawal:** Open the withdrawal flow without submitting a
   real transaction. Explain the available amount, fee/receipt information,
   and what happens if the vault cannot provide immediate liquidity.

## Observation and severity rubric

For each task, record completion, time band (under 1 minute, 1–3 minutes,
over 3 minutes), wrong turns, requests for help, and the participant’s own
description of what happened. Do not infer intent from a click alone.

| Severity | Use when |
|----------|----------|
| Critical | Participant could authorize an unintended transaction, select an unintended network, or misunderstand loss of access to funds. Stop the task and record the safety issue. |
| High | Participant cannot complete a core task or cannot tell whether a transaction was submitted or completed. |
| Medium | Participant completes the task with a wrong turn, repeated hesitation, or moderator help. |
| Low | Wording or layout causes a brief question but the participant completes the task unaided. |

## Session record

Copy this table once per participant. Leave the observed fields blank until a
real session is run; never report planned outcomes as findings.

| Task | Outcome / time band | Wrong turns or quotes (anonymous) | Severity | Follow-up linked to issue |
|------|---------------------|-----------------------------------|----------|---------------------------|
| Connect | | | | |
| Network | | | | |
| Review an amount | | | | |
| Confirm a deposit | | | | |
| Understand withdrawal | | | | |

## Findings and follow-up

After sessions, group repeated observations by task. A finding should include
the number of participants affected, observed evidence, severity, and the
specific interface location. Create a follow-up issue for each actionable
finding and link it to #507; prioritize Critical and High findings before
cosmetic changes. Do not claim a finding from a single participant represents
all users.

**Study status:** protocol prepared; no participant sessions or observed
outcomes are recorded in this repository yet.
