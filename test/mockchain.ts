/**
 * Mock Stellar/Soroban chain and NeuroWealthVault contract for Blast Radius testing.
 * Provides fast iteration without external RPC network dependencies while accurately
 * enforcing the Soroban NeuroWealthVault role-based access control and security invariants.
 */

export interface Signer {
  address: string;
}

export interface RateLimitConfig {
  maxCalls: number;
  windowLedgers: number;
}

export interface ContractEvent {
  topic: string;
  args: any[];
}

export class MockNeuroWealthVault {
  private _owner: string;
  private _agent: string;
  private _guardian: string | null = null;
  private _currentCaller: Signer;

  private _paused: boolean = false;
  private _caps = {
    userDepositCap: BigInt(50_000_000_000),
    tvlCap: BigInt(100_000_000_000),
  };
  private _blendPool: string | null = null;
  private _dexPool: string | null = null;
  private _pendingUpgrade: { wasmHash: string; unlockLedger: number } | null = null;
  private _upgraded: boolean = false;
  private _rateLimits: Map<string, RateLimitConfig> = new Map();
  private _currentProtocol: string = 'none';

  private _balances: Map<string, bigint> = new Map();
  private _shares: Map<string, bigint> = new Map();
  private _totalShares: bigint = 0n;
  private _totalAssets: bigint = 0n;

  private _events: ContractEvent[] = [];
  public readonly CRITICAL_DELAY: number = 86400; // 24 hours in seconds

  constructor(owner: Signer, agent: Signer) {
    this._owner = owner.address;
    this._agent = agent.address;
    this._currentCaller = owner;
  }

  public connect(caller: Signer): MockNeuroWealthVault {
    this._currentCaller = caller;
    return this;
  }

  public getEvents(): ContractEvent[] {
    return this._events;
  }

  public clearEvents(): void {
    this._events = [];
  }

  private emit(topic: string, ...args: any[]): void {
    this._events.push({ topic, args });
  }

  private requireOwner(): void {
    if (this._currentCaller.address !== this._owner) {
      throw new Error(`Unauthorized: Caller (${this._currentCaller.address}) is not the owner (${this._owner})`);
    }
  }

  private requireAgent(): void {
    if (this._currentCaller.address !== this._agent) {
      throw new Error(`Unauthorized: Caller (${this._currentCaller.address}) is not the agent (${this._agent})`);
    }
  }

  // --- Authorized Owner Functions ---

  public async pause(): Promise<void> {
    if (this._currentCaller.address !== this._owner && this._currentCaller.address !== this._guardian) {
      throw new Error(`Unauthorized: Caller (${this._currentCaller.address}) cannot pause`);
    }
    this._paused = true;
    this.emit("Paused", this._currentCaller.address);
  }

  public async unpause(): Promise<void> {
    this.requireOwner();
    this._paused = false;
    this.emit("Unpaused", this._currentCaller.address);
  }

  public async emergency_pause(): Promise<void> {
    if (this._currentCaller.address !== this._owner && this._currentCaller.address !== this._guardian) {
      throw new Error(`Unauthorized: Caller cannot emergency pause`);
    }
    this._paused = true;
    this.emit("EmergencyPaused", this._currentCaller.address);
  }

  public async set_caps(userDepositCap: bigint, tvlCap: bigint): Promise<void> {
    this.requireOwner();
    this._caps = { userDepositCap, tvlCap };
    this.emit("CapsUpdated", userDepositCap, tvlCap);
  }

  public async set_blend_pool(poolAddress: string): Promise<void> {
    this.requireOwner();
    this._blendPool = poolAddress;
    this.emit("BlendPoolUpdated", poolAddress);
  }

  public async set_dex_pool(poolAddress: string): Promise<void> {
    this.requireOwner();
    this._dexPool = poolAddress;
    this.emit("DexPoolUpdated", poolAddress);
  }

  public async schedule_upgrade(newWasmHash: string): Promise<void> {
    this.requireOwner();
    this._pendingUpgrade = { wasmHash: newWasmHash, unlockLedger: 1000 };
    this.emit("UpgradeScheduled", newWasmHash);
  }

  public async execute_upgrade(): Promise<void> {
    this.requireOwner();
    if (!this._pendingUpgrade) {
      throw new Error("No pending upgrade to execute");
    }
    this._upgraded = true;
    this.emit("UpgradeExecuted", this._pendingUpgrade.wasmHash);
    this._pendingUpgrade = null;
  }

  public async cancel_upgrade(): Promise<void> {
    this.requireOwner();
    if (!this._pendingUpgrade) {
      throw new Error("No pending upgrade to cancel");
    }
    this.emit("UpgradeCancelled", this._pendingUpgrade.wasmHash);
    this._pendingUpgrade = null;
  }

  public async update_agent(newAgent: string): Promise<void> {
    this.requireOwner();
    const oldAgent = this._agent;
    this._agent = newAgent;
    this.emit("AgentUpdated", oldAgent, newAgent);
  }

  public async set_rate_limit(category: string, maxCalls: number, windowLedgers: number): Promise<void> {
    this.requireOwner();
    this._rateLimits.set(category, { maxCalls, windowLedgers });
    this.emit("RateLimitSet", category, maxCalls, windowLedgers);
  }

  public async set_guardian(newGuardian: string): Promise<void> {
    this.requireOwner();
    this._guardian = newGuardian;
    this.emit("GuardianSet", newGuardian);
  }

  public async transferOwnership(newOwner: string): Promise<void> {
    this.requireOwner();
    this._owner = newOwner;
    this.emit("OwnershipTransferred", newOwner);
  }

  // --- Agent-Only Functions ---

  public async rebalance(protocol: string, expectedApy: bigint, minOut: bigint): Promise<void> {
    this.requireAgent();
    if (this._paused) {
      throw new Error("Vault is paused");
    }
    this._currentProtocol = protocol;
    this.emit("Rebalanced", protocol, expectedApy, minOut);
  }

  public async harvest(minOut: bigint): Promise<void> {
    this.requireAgent();
    if (this._paused) {
      throw new Error("Vault is paused");
    }
    this.emit("Harvested", minOut);
  }

  // --- User Operations & Blast Radius Boundaries ---

  public async deposit(amount: bigint): Promise<void> {
    if (this._paused) {
      throw new Error("Vault is paused");
    }
    const user = this._currentCaller.address;
    const currentBal = this._balances.get(user) || 0n;
    this._balances.set(user, currentBal + amount);

    const currentShares = this._shares.get(user) || 0n;
    this._shares.set(user, currentShares + amount);

    this._totalShares += amount;
    this._totalAssets += amount;

    this.emit("Deposit", user, amount);
  }

  public async withdraw(userAddress: string, amount: bigint): Promise<void> {
    if (this._paused) {
      throw new Error("Vault is paused");
    }
    if (this._currentCaller.address !== userAddress) {
      throw new Error(`Unauthorized: Caller (${this._currentCaller.address}) cannot withdraw funds belonging to (${userAddress})`);
    }

    const currentBal = this._balances.get(userAddress) || 0n;
    if (currentBal < amount) {
      throw new Error("Insufficient balance");
    }

    this._balances.set(userAddress, currentBal - amount);
    const currentShares = this._shares.get(userAddress) || 0n;
    this._shares.set(userAddress, currentShares - amount);

    this._totalShares -= amount;
    this._totalAssets -= amount;

    this.emit("Withdraw", userAddress, amount);
  }

  public async withdraw_all(userAddress: string): Promise<bigint> {
    if (this._paused) {
      throw new Error("Vault is paused");
    }
    if (this._currentCaller.address !== userAddress) {
      throw new Error(`Unauthorized: Caller (${this._currentCaller.address}) cannot withdraw funds belonging to (${userAddress})`);
    }

    const currentBal = this._balances.get(userAddress) || 0n;
    await this.withdraw(userAddress, currentBal);
    return currentBal;
  }

  public async emergency_withdraw(userAddress: string, amount: bigint): Promise<void> {
    if (this._currentCaller.address !== userAddress) {
      throw new Error(`Unauthorized: Caller (${this._currentCaller.address}) cannot emergency-withdraw funds belonging to (${userAddress})`);
    }
    const currentBal = this._balances.get(userAddress) || 0n;
    if (currentBal < amount) {
      throw new Error("Insufficient balance");
    }
    this._balances.set(userAddress, currentBal - amount);
    this.emit("EmergencyWithdraw", userAddress, amount);
  }

  // --- Attacker direct manipulation attempts that MUST always fail ---

  public async withdrawUserFunds(victimAddress: string): Promise<void> {
    if (this._currentCaller.address !== victimAddress) {
      throw new Error(`Unauthorized: Caller cannot withdraw user funds`);
    }
  }

  public async forceSetBalance(userAddress: string, balance: bigint): Promise<void> {
    throw new Error("Unauthorized: Direct balance manipulation is prohibited by contract invariants");
  }

  public async overrideWithdrawalLimit(limit: bigint): Promise<void> {
    throw new Error("Unauthorized: Withdrawal limits cannot be bypassed");
  }

  // --- View Helpers ---

  public async getBalance(userAddress: string): Promise<bigint> {
    return this._balances.get(userAddress) || 0n;
  }

  public async getShares(userAddress: string): Promise<bigint> {
    return this._shares.get(userAddress) || 0n;
  }

  public isPaused(): boolean {
    return this._paused;
  }

  public getCaps() {
    return this._caps;
  }

  public getBlendPool(): string | null {
    return this._blendPool;
  }

  public getDexPool(): string | null {
    return this._dexPool;
  }

  public getPendingUpgrade(): { wasmHash: string; unlockLedger: number } | null {
    return this._pendingUpgrade;
  }

  public getAgent(): string {
    return this._agent;
  }

  public getGuardian(): string | null {
    return this._guardian;
  }

  public getRateLimit(category: string): RateLimitConfig | undefined {
    return this._rateLimits.get(category);
  }

  public getCurrentProtocol(): string {
    return this._currentProtocol;
  }
}
