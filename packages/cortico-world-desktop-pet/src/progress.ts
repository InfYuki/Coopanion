/**
 * 任务进度气泡的话：`cortico-world-dsh-monitor` 判出的里程碑与完成汇报，压成桌宠气泡里的一行行。
 *
 * 纯函数：不读文件、不看时间、不发气泡。文案全从 `ProgressText` 来（src/i18n 的 `progress` 组），
 * 所以这里只按 kind 挑一行、按行数截断，不关心是哪国话。
 */
import type { Completion, Milestone } from 'cortico-world-dsh-monitor';

/** 进度气泡要说的话，一个应用语言一份（src/i18n）。 */
export interface ProgressText {
  /** 子代理完成子任务 */
  subagentDone: (label: string) => string;
  /** 一个会话做完一轮 */
  turnDone: (session: string, turns: number) => string;
  /** 一个待办完成 */
  todoDone: (session: string, latest: string, done: number, total: number) => string;
  /** 目标状态变了 */
  goalMoved: (session: string, to: string) => string;
  /** 多项合并时的尾巴 */
  more: (n: number) => string;
  /** 完成汇报的标题与几行 */
  completedTitle: (session: string) => string;
  /** 轮数与用量；用量已经是格式化过的字（`humanTokens`），这一层不认识单位 */
  completedLine: (turns: number, tokens: string) => string;
  completedGoal: (objective: string) => string;
  nothingGoal: string;
}

/** `Milestone.data` 是 `Record<string, unknown>`：读之前先收窄，缺了或不是这一型就当作空串 / 0。 */
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * 一个里程碑的一行。`subagent-done` 的 label 来自父会话的子代理目录，父会话不在这一轮的列表里时
 * 检测模块给不出 label，那就退化成「这一轮做完了」，总比不吭声强。
 */
export function milestoneLine(m: Milestone, text: ProgressText): string {
  switch (m.kind) {
    case 'subagent-done': {
      const label = str(m.data.label);
      return label ? text.subagentDone(label) : text.turnDone(m.session, num(m.data.turns));
    }
    case 'turn-done': return text.turnDone(m.session, num(m.data.turns));
    case 'todo-done': return text.todoDone(m.session, str(m.data.latest), num(m.data.completed), num(m.data.total));
    case 'goal-phase': return text.goalMoved(m.session, str(m.data.to));
  }
  // 这一版认识的 kind 都在上面;检测模块以后加新的,这里不吭声
  return '';
}

/**
 * 把一批里程碑压成一条气泡正文：每项一行，最多 `maxLines` 行；超出的不再列，用 `more(n)` 收尾。
 * 一句也没有时是空串，调用方据此决定不说。
 */
export function formatMilestones(milestones: readonly Milestone[], text: ProgressText, maxLines = 3): string {
  if (milestones.length === 0) return '';
  const shown = maxLines > 0 ? milestones.slice(0, maxLines) : [];
  const lines = shown.map((m) => milestoneLine(m, text));
  const rest = milestones.length - shown.length;
  if (rest > 0) lines.push(text.more(rest));
  return lines.join('\n');
}

/**
 * 完成汇报：标题、轮数与用量，第三行是目标原文或「没有设目标」。用量由调用方格式化
 * （`humanTokens`），这一层不认识单位。
 */
export function formatCompletion(completion: Completion, text: ProgressText, human: (n: number) => string): string {
  const goal = completion.goalCompleted && completion.objective ? text.completedGoal(completion.objective) : text.nothingGoal;
  return [text.completedTitle(completion.session), text.completedLine(completion.turns, human(completion.tokens)), goal].join('\n');
}
