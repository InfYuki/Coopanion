/** Timestamps, including quota reset times, use Unix milliseconds. */
export interface CodexRateLimitSnapshot {
  limitId: string;
  limitName?: string;
  primary?: CodexRateLimitWindow;
  secondary?: CodexRateLimitWindow;
  credits?: { hasCredits: boolean; unlimited: boolean; balance?: string };
  planType?: string;
  observedAt: number;
  source: 'log' | 'app-server';
}
export interface CodexRateLimitWindow { usedPercent: number; windowMinutes?: number; resetsAt?: number }
export type CodexStatus = 'running' | 'idle' | 'completed' | 'failed' | 'blocked' | 'waiting_approval' | 'interrupted' | 'unknown';
export interface CodexPlanStep { step: string; status: string }
export interface CodexGoal { id?: string; status: string; tokensUsed?: number; tokenBudget?: number }
export interface CodexSession {
  id: string;
  title: string;
  cwd: string;
  parentId?: string;
  agentPath?: string;
  status: CodexStatus;
  updatedAt: number;
  totalTokens: number;
  todayTokens: number;
  plan: CodexPlanStep[];
  goal?: CodexGoal;
}
export type CodexMilestoneKind = 'turn_complete' | 'goal_complete' | 'plan_updated' | 'step_complete' | 'failed' | 'blocked' | 'approval' | 'interrupted' | 'agent_complete';
export interface CodexMilestone { id: string; sessionId: string; kind: CodexMilestoneKind; timestamp: number; detail?: string }
export interface CodexSnapshot {
  home: string;
  available: boolean;
  sessions: CodexSession[];
  usage: { totalTokens: number; todayTokens: number; partial: boolean };
  rateLimits: CodexRateLimitSnapshot[];
  milestones: CodexMilestone[];
  warnings: string[];
}
export interface CodexSourceOptions {
  home?: string;
  timezone?: string;
  maxFiles?: number;
  /** Per-file tail on first observation; subsequent reads resume at the last complete line. */
  maxReadBytes?: number;
  maxScanBytes?: number;
}
