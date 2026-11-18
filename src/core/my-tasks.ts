// My Tasks (decision 0041): the office's tasks for a role, with a priority only the office sets,
// plus tasks the person adds, each with a status and notes the person keeps on the phone.

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'not_started',
  'in_progress',
  'blocked',
  'completed',
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** One office task in src/roles/my-tasks.json. */
export interface OfficeTask {
  id: string;
  title: string;
  priority: TaskPriority;
  /** Starting notes. They fill the task's Notes box, which the person can edit or clear. */
  notes?: string;
  retired?: true;
}

/** src/roles/my-tasks.json, validated at build time against schemas/my-tasks.schema.json. */
export interface MyTasksFile {
  format_version: 1;
  version: number;
  roles: Record<string, OfficeTask[]>;
}

/** What the person saved for one task: an office task by id, or a task they added. */
export interface TaskProgress {
  id: string;
  role_id: string;
  source: { kind: 'office'; task_id: string } | { kind: 'own'; title: string };
  status: TaskStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** One row on the My Tasks screen and the picture. */
export interface MyTask {
  /** Stable for the row: `office:<task id>`, or the own task's progress id. */
  key: string;
  kind: 'office' | 'own';
  /** The office task's id; null for own tasks. */
  task_id: string | null;
  title: string;
  /** Office tasks only. */
  priority: TaskPriority | null;
  status: TaskStatus;
  notes: string;
  /** The saved record, or null for an office task never changed. */
  progress_id: string | null;
}

export const OWN_TITLE_MAX = 120;

/** The office tasks for a role, or null when the role has no My Tasks. */
export function myTasksFor(file: MyTasksFile, roleId: string | null): OfficeTask[] | null {
  if (roleId === null) return null;
  return Object.hasOwn(file.roles, roleId) ? (file.roles[roleId] ?? null) : null;
}

const byCreated = (a: TaskProgress, b: TaskProgress) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1;

/**
 * Office tasks in file order (retired ones left out), then the person's own tasks oldest first.
 * Progress for other roles and for retired tasks stays stored but isn't shown.
 */
export function myTaskList(
  office: readonly OfficeTask[],
  progress: readonly TaskProgress[],
  roleId: string,
): MyTask[] {
  const mine = progress.filter((p) => p.role_id === roleId);
  const byTask = new Map<string, TaskProgress>();
  for (const p of mine) if (p.source.kind === 'office') byTask.set(p.source.task_id, p);
  const officeRows = office
    .filter((t) => !t.retired)
    .map((t): MyTask => {
      const saved = byTask.get(t.id);
      return {
        key: `office:${t.id}`,
        kind: 'office',
        task_id: t.id,
        title: t.title,
        priority: t.priority,
        status: saved?.status ?? 'not_started',
        // The office's notes until the person saves their own; clearing them sticks.
        notes: saved?.notes ?? t.notes ?? '',
        progress_id: saved?.id ?? null,
      };
    });
  const ownRows = mine
    .filter((p) => p.source.kind === 'own')
    .sort(byCreated)
    .map((p): MyTask => ({
      key: p.id,
      kind: 'own',
      task_id: null,
      title: p.source.kind === 'own' ? p.source.title : '',
      priority: null,
      status: p.status,
      notes: p.notes,
      progress_id: p.id,
    }));
  return [...officeRows, ...ownRows];
}

/** "2 of 4 done" on Home. */
export function taskProgressSummary(list: readonly MyTask[]): { done: number; total: number } {
  return { done: list.filter((t) => t.status === 'completed').length, total: list.length };
}

/** Why an own task's name can't be saved, in plain words; null when it can. */
export function ownTitleProblem(title: string): string | null {
  const t = title.trim();
  if (!t) return 'Enter a task name.';
  if (t.length > OWN_TITLE_MAX) return `Keep the task name to ${String(OWN_TITLE_MAX)} characters.`;
  return null;
}

function fresh(
  roleId: string,
  source: TaskProgress['source'],
  id: string,
  now: string,
): TaskProgress {
  return {
    id,
    role_id: roleId,
    source,
    status: 'not_started',
    notes: '',
    created_at: now,
    updated_at: now,
  };
}

/** A task the person adds. */
export function newOwnTask(roleId: string, title: string, id: string, now: string): TaskProgress {
  return fresh(roleId, { kind: 'own', title: title.trim() }, id, now);
}

/**
 * The first saved record for an office task, made when its status or notes first change. It
 * starts from the notes the screen showed, so the office's notes carry over.
 */
export function officeProgress(
  roleId: string,
  taskId: string,
  id: string,
  now: string,
  notes = '',
): TaskProgress {
  return { ...fresh(roleId, { kind: 'office', task_id: taskId }, id, now), notes };
}
