# Pending shares wording evaluation

## Method

A desk-based scenario walkthrough compared “pending shares” with wording that names the reason shares are unavailable. Each scenario was checked against three questions a reader needs to answer from the screen. How much can I withdraw now? Why is the rest unavailable? When can I use it, and do I need to act? These findings describe what the copy communicates in the scenarios. Participant comprehension remains unmeasured.

The locked-share scenarios follow the vault's [lock and unlock behavior](../../neurowealth-vault/contracts/vault/src/lib.rs). A lock expires at a ledger threshold and the holder must submit an unlock transaction. Use the confirmation scenario only when the activity view has an actual submitted transaction to track.

## Scenario walkthrough and wording changes

| Scenario and prompt | Before and comprehension gap | Revised example and walkthrough result |
| --- | --- | --- |
| You own 100 shares and 40 are locked. How many could you withdraw now, and what happens to the 40? | “40 shares pending” leaves the available amount, reason and next step open to interpretation. | “60 shares available to withdraw. 40 shares are locked. You can unlock them once the lock period ends.” This gives the available amount and explains that unlocking is a separate step. |
| The lock period has ended. Can you now withdraw all 100 shares? | “40 shares pending” gives no indication that the user can act. | “60 shares available to withdraw. 40 shares are ready to unlock.” Show **Unlock shares**. The 40 become available after the unlock transaction confirms. |
| All 100 shares are locked and an unlock time is unknown. Can you withdraw any now, or plan around a specific date? | “100 shares pending” gives neither an explicit available amount nor a useful timing cue. | “0 shares available to withdraw. All 100 shares are locked. You can unlock them once the lock period ends.” This answers what can be withdrawn and gives the condition without guessing a date. |
| You submitted an unlock transaction for 40 shares. Should you submit again? | “40 shares pending” fails to identify which action is underway. | “Unlock submitted. Waiting for network confirmation. Your 40 shares are still locked.” Keep the confirmed available count visible and offer transaction status. Hide the duplicate unlock action while confirmation is pending. |

## Copy rules

- Lead with **Available to withdraw** and its share amount. Show **Total shares** and the unavailable amount in the same unit. Any estimated asset equivalent needs its own unit and an estimate label.
- Use **Locked**, **Ready to unlock**, or **Waiting for network confirmation** for the corresponding state. Show **Unlock shares** only after eligibility is known. Change the available amount after confirmation and a refreshed position.
- If a date is reliably estimated from the unlock ledger, label it “Estimated unlock eligibility” and give its timezone. If the availability data itself is missing, say “Share availability is temporarily unavailable” and offer a refresh.

## Participant check protocol

Present mock positions using the four scenarios above. Shuffle scenario order and alternate which wording version participants see first. Ask the three questions in the method section without cues. Record each answer as correct, incorrect or uncertain, with the participant's explanation and any intended action. For the submitted case, record whether the participant would submit again. Look for independent identification of the available amount, reason and next action before selecting final copy.
