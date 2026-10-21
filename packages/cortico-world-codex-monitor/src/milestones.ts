import type { CodexMilestone, CodexMilestoneKind } from './types.ts';

/** The initial scan establishes the baseline. New files can contain old history. */
export function visibleMilestones(events: CodexMilestone[], initialized: boolean, startedAt: number): CodexMilestone[] {
  return initialized ? events.filter(event => event.timestamp >= startedAt) : [];
}

export function milestone(sessionId: string, kind: CodexMilestoneKind, timestamp: number, ordinal: string, detail?: string): CodexMilestone {
  return { id: `${sessionId}:${ordinal}:${timestamp}:${kind}`, sessionId, kind, timestamp, ...(detail ? { detail } : {}) };
}
