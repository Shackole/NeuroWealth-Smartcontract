# Admin Panel Deployment Guide

## Prerequisites

- Node.js 18+ and npm
- Stellar contract address (from vault deployment)
- Freighter wallet extension installed in browser
- Valid RPC endpoint (testnet/mainnet/devnet)

## Local Development

### 1. Install Dependencies

```bash
cd packages/admin-panel
npm install
```

### 2. Configure Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_CONTRACT_ID=C1234567890abcdef...  # Replace with your contract ID
```

### 3. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

### 4. Test Admin Functions

1. Click "Connect Wallet"
2. Select network (testnet/mainnet/devnet)
3. Approve in Freighter
4. Enter contract address
5. All admin controls appear if you're the owner

## Production Deployment

### Option 1: Vercel (Recommended)

```bash
# 1. Push to GitHub
git add packages/admin-panel
git commit -m "Add admin panel"
git push -u origin admin-panel-feature

# 2. Connect repo to Vercel
# - Import from GitHub
# - Root directory: packages/admin-panel
# - Build: npm run build
# - Start: npm start

# 3. Set environment variables in Vercel dashboard
# - NEXT_PUBLIC_CONTRACT_ID=C...

# 4. Deploy
vercel deploy --prod
```

### Option 2: Self-Hosted (Docker)

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/admin-panel ./packages/admin-panel
COPY packages/vault-client ./packages/vault-client

WORKDIR /app/packages/admin-panel

# Install dependencies
RUN npm install

# Build
RUN npm run build

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t neurowealth-admin .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_CONTRACT_ID=C... \
  neurowealth-admin
```

### Option 3: Netlify

```bash
# 1. Create netlify.toml
cat > packages/admin-panel/netlify.toml << EOF
[build]
  command = "npm run build"
  functions = "out"
  publish = ".next"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[env]
  [env.production]
    NEXT_PUBLIC_CONTRACT_ID = "C..."
EOF

# 2. Deploy
netlify deploy --prod
```

## Administrative Roles & Operational Access Control

To maintain least-privilege security and eliminate single points of failure across production environments, administrative duties are divided into explicit operational roles. Each role maps directly to permitted contract invocations, required signer security profiles, and operational boundaries.

### Role-to-Task Mapping Matrix

| Role Name | Permitted Operational Tasks | Prohibited Tasks | Signing Profile & Key Custody | Dual-Control / Multi-sig Required |
|---|---|---|---|---|
| **Contract Owner (Super Admin)** | • Two-step ownership transfer (`transfer_ownership`, `accept_ownership`)<br>• Protocol contract upgrade scheduling and execution (`upgrade`, `set_upgrade_timelock`)<br>• Cap & limits management (`set_tvl_cap`, `set_user_deposit_cap`, `set_deposit_limits`)<br>• Protocol policy tuning (`set_insurance_fee`, `set_pool_config`, `set_approval_ttl`)<br>• Full unpause & resume (`unpause`)<br>• Agent appointment & timelock updates (`set_agent`) | • Direct arbitrary fund extraction to untracked accounts<br>• Single-signature instant upgrades without timelock | Air-gapped cold storage or hardware signer (Ledger). Never stored in environment variables or cloud keys. | **Yes** (2-of-3 or 3-of-5 Stellar multi-sig threshold required on mainnet) |
| **Emergency Guardian** | • Rapid circuit breaking (`emergency_pause`, `pause`)<br>• Monitoring anomalous invariant breaks or oracle price deviations | • Unpausing the vault (`unpause`)<br>• Modifying financial caps or fee parameters<br>• Upgrading contracts or appointing agents | Hardware wallet or secure hot key behind automated sentinel monitoring with hardware-backed KMS. | **No** (single emergency trigger allowed for sub-second incident response) |
| **Rebalance Agent / Bot Operator** | • Routine automated asset rebalancing (`rebalance`) across Blend and DEX liquidity pools<br>• Updating total assets and accounting state (`update_total_assets`)<br>• Yield harvesting (`harvest`) | • Modifying vault pause states<br>• Altering caps, fees, or cooldown timers<br>• Appointing new agents or transferring ownership | Dedicated Soroban service account key, strictly restricted to rebalance contract entrypoints. | **No** (automated cron / pipeline, but rate-limited by contract cooldowns) |
| **Risk & Parameters Officer** | • Evaluating vault liquidity and setting cap recommendations<br>• Testing pool configurations on testnet staging<br>• Staging upgrade proposals in admin panel<br>• Inspecting queue health and withdrawal settlement | • Executing mainnet parameter changes independently<br>• Initiating unauthorized contract upgrades | Standard Freighter browser wallet authenticated to testnet; read-only on mainnet. | **N/A** (proposals submitted to Owner multi-sig for execution) |
| **Read-Only Observer / Auditor** | • Querying contract state (`get_exchange_rate`, `get_total_assets`, `get_tvl_cap`, `is_paused`)<br>• Inspecting Soroban event logs and indexer feeds<br>• Reconciling ledger reserves against on-chain protocol balances | • All state-mutating contract invocations | Public read-only connection; no signing private key required. | **No** |

---

## Operator Access Granting & Onboarding Process

Follow this repeatable, documented procedure whenever onboarding an operator colleague to ensure authorization integrity:

```
[1. Access Request & Verification]
               │
               ▼
[2. Key Generation & Custody Setup]
               │
               ▼
[3. Testnet Dry Run & Role Simulation]
               │
               ▼
[4. Multi-Sig Proposal / Key Delegation]
               │
               ▼
[5. Onboarding Verification Checklist Sign-Off]
```

### Step 1: Access Request & Role Scoping
1. The sponsoring lead operator submits an access request detailing:
   - Candidate full name, role, and corporate email
   - Target environment (`testnet`, `devnet`, or `mainnet`)
   - Specific role requested (e.g., `Emergency Guardian`, `Rebalance Agent Operator`)
   - Business justification and operational tasks to be performed
2. Two existing Owner keyholders review and approve the justification in the operational log.

### Step 2: Key Generation & Custody Verification
1. The colleague generates a dedicated Stellar keypair using an approved hardware device (Ledger Nano S/X) running the Stellar app.
2. The colleague verifies their public address (`G...`) on the hardware screen and provides only the public key to the admin team.
3. Under no circumstances may private keys, secret seeds (`S...`), or recovery mnemonic phrases be transmitted via email, chat, or saved to shared drives.

### Step 3: Testnet Dry Run & Verification
1. The colleague is granted the corresponding role on the testnet contract.
2. In the admin panel (`npm run dev` pointing to testnet):
   - Colleague connects Freighter with their testnet account.
   - Colleague performs a simulated permitted action (e.g., triggering a test pause or submitting a test cap update).
   - Colleague attempts a prohibited action and confirms that the contract properly rejects the unauthorized invocation (`Error(Contract, #100)` / `NotAuthorized`).

### Step 4: Multi-Sig Quorum Grant (Mainnet)
1. For Owner/Guardian roles: An existing owner initiates a multi-sig transaction on Stellar to add the colleague's public key with the appropriate signing weight.
2. At least two current multi-sig signers review the public key and payload hash on their hardware screens before confirming.
3. The transaction is submitted to the Soroban network and confirmed on the ledger.

---

## Operator Onboarding Verification Checklist

Before an operator is declared active and permitted to conduct production operations, all items on this checklist must be verified and logged:

- [ ] **Role Definition & Approval**: Exact role assigned matches the Role-to-Task Mapping Matrix, with written dual-operator sign-off.
- [ ] **Hardware Custody Verified**: Operator possesses an approved hardware wallet with PIN protection; seed phrase backed up in fireproof, air-gapped storage.
- [ ] **Freighter Extension Configured**: Official Freighter extension installed from verified source; network RPC endpoints match production configuration.
- [ ] **Public Key Authenticated**: Operator public key verified out-of-band (e.g., via video confirmation or in-person fingerprint check) to prevent MITM substitution.
- [ ] **Testnet Rehearsal Completed**: Operator successfully executed permitted task on testnet and demonstrated familiarity with emergency procedures.
- [ ] **Negative Permission Tested**: Operator confirmed unauthorized tasks fail with appropriate contract error codes.
- [ ] **Incident Communication Enrolled**: Operator added to high-priority alert channels (PagerDuty, emergency Slack channel) with 2FA enabled.
- [ ] **Timelock Awareness**: Operator trained on the upgrade timelock delay period and emergency cancellation procedures.
- [ ] **Revocation Runbook Provided**: Colleague provided with standard revocation instructions in the event of lost hardware or suspect compromise.
- [ ] **Audit Trail Logged**: Operator public key, assigned role, grantor public keys, and ledger transaction hash recorded in the administrative access registry.

---

## Security Checklist

Before going to production:

- [ ] Contract ID is correct for target network
- [ ] Owner keypair is secure and backed up
- [ ] Freighter wallet is installed on deployment machine
- [ ] HTTPS enabled (all hosts provide this by default)
- [ ] Contract access control verified (owner checks work)
- [ ] Test pause/unpause on testnet first
- [ ] Test caps configuration on testnet
- [ ] Test ownership transfer flow on testnet
- [ ] Document all admin procedures
- [ ] Set up monitoring/alerting for contract events

## Testnet Deployment Flow

```
1. Deploy contract to testnet
2. Note contract address from deployment output
3. Set NEXT_PUBLIC_CONTRACT_ID in .env.local
4. Run: npm run dev
5. Connect with testnet account (Freighter)
6. Test each admin function
7. Verify contract events emitted
8. Check event indexing works
9. Document any issues
10. Move to mainnet only when fully tested
```

## Mainnet Security

### Pre-Deployment Verification

```bash
# 1. Verify contract on Soroban explorer
# https://explorer.soroban.stellar.org/?network=mainnet

# 2. Verify owner keypair
# - Use hardware wallet (Ledger) if possible
# - OR: Air-gapped cold storage
# - NEVER: Store in env vars in production

# 3. Verify RPC endpoint
# - Use official Soroban RPC
# - https://soroban.stellar.org (mainnet)

# 4. Test operations on testnet mirror first
```

### Admin Multi-Sig Setup (Recommended)

For mainnet, consider using multi-sig for owner account:

1. Create Stellar multi-sig account (requires 2-of-3 approvals)
2. Transfer contract ownership to multi-sig
3. Use Freighter with multi-sig account
4. All admin operations require multiple signatures

## Monitoring & Alerts

### Set Up Event Monitoring

```typescript
// Example: Listen for pause events
const listener = new VaultEventListener({
  contractId: "C...",
  server: sorobanServer,
  networkPassphrase: Networks.PUBLIC,
});

listener.onPause((event) => {
  // Alert: Vault was paused
  console.error("ALERT: Vault paused by", event.admin);
  // Send notification (Slack, PagerDuty, etc.)
});
```

### Recommended Alerts

- Emergency pause/unpause
- TVL cap changes
- Agent update initiations
- Upgrade schedules
- Ownership transfer attempts
- Failed transactions

## Troubleshooting

### "Contract ID not configured"

```bash
# Fix: Set NEXT_PUBLIC_CONTRACT_ID
echo "NEXT_PUBLIC_CONTRACT_ID=C..." > .env.local
npm run dev
```

### "Not the contract owner"

```bash
# Fix: Connect with the owner account in Freighter
# OR: Transfer ownership if you have a new owner
```

### "Transaction not confirmed"

```bash
# 1. Check network connectivity
# 2. Verify contract address is correct
# 3. Check Soroban RPC status
# 4. Try again with longer timeout
```

### Freighter Not Signing

```bash
# 1. Ensure Freighter is installed
# 2. Ensure network matches Freighter setting
# 3. Check browser console for errors
# 4. Restart browser
```

## Rollback Procedure

If admin panel needs to be disabled:

1. Update DNS/deployment to remove admin URL
2. Pause contract via deployed admin panel instance (before removing)
3. Delete environment variables from hosting platform
4. Archive GitHub branch (don't delete)

## Support & Maintenance

### Regular Checks

- [ ] Test admin operations weekly
- [ ] Verify Freighter compatibility after updates
- [ ] Monitor contract event stream
- [ ] Review transaction history
- [ ] Backup owner keypair securely

### Upgrade Procedure

```bash
# 1. Update dependencies
npm update

# 2. Test locally
npm run dev

# 3. Deploy to staging
vercel deploy

# 4. Test on testnet
# 5. Deploy to production
vercel deploy --prod
```

## Contact & Escalation

For production issues:

1. Check deployment logs
2. Verify contract state via explorer
3. Check RPC status
4. Contact Stellar support if RPC issue
5. Review contract access control if auth issue
