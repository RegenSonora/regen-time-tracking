// My Tasks list rules (decision 0041): office tasks with priority, own tasks, saved progress.
import { describe, expect, it } from 'vitest';
import {
  myTaskList,
  myTasksFor,
  newOwnTask,
  officeProgress,
  ownTitleProblem,
  PRIORITY_LABELS,
  STATUS_LABELS,
  taskProgressSummary,
  TASK_STATUSES,
  type MyTasksFile,
  type OfficeTask,
  type TaskProgress,
} from '../../src/core/my-tasks';
import shipped from '../../src/roles/my-tasks.json';

const NOW = '2026-11-17T09:00:00-07:00';
const LATER = '2026-11-17T10:00:00-07:00';

const office: OfficeTask[] = [
  { id: 'walk-plots', title: 'Walk Pinal garden plots', priority: 'high' },
  { id: 'old', title: 'Old task', priority: 'low', retired: true },
  { id: 'mulch', title: 'Order mulch', priority: 'medium', details: 'Ask for two quotes.' },
];

const progress = (
  over: Partial<TaskProgress> & Pick<TaskProgress, 'id' | 'source'>,
): TaskProgress => ({
  role_id: 'r-tl01',
  status: 'not_started',
  notes: '',
  created_at: NOW,
  updated_at: NOW,
  ...over,
});

describe('labels', () => {
  it('has the four statuses in order, in plain words', () => {
    expect(TASK_STATUSES.map((s) => STATUS_LABELS[s])).toEqual([
      'Not started',
      'In progress',
      'Blocked',
      'Completed',
    ]);
  });

  it('names each priority', () => {
    expect(PRIORITY_LABELS).toEqual({ low: 'Low', medium: 'Medium', high: 'High' });
  });
});

describe('myTasksFor', () => {
  const file: MyTasksFile = { format_version: 1, version: 1, roles: { 'r-tl01': office } };

  it('gives a listed role its office tasks and null for any other role', () => {
    expect(myTasksFor(file, 'r-tl01')).toBe(office);
    expect(myTasksFor(file, 'r-gc01')).toBeNull();
    expect(myTasksFor(file, null)).toBeNull();
  });

  it('the shipped file turns My Tasks on for the Resilience Team Lead only', () => {
    const f = shipped as MyTasksFile;
    expect(myTasksFor(f, 'r-tl01')).not.toBeNull();
    expect(myTasksFor(f, 'r-c01')).toBeNull();
  });
});

describe('myTaskList', () => {
  it('lists office tasks in file order, leaving out retired ones, as not started', () => {
    const list = myTaskList(office, [], 'r-tl01');
    expect(list.map((t) => [t.kind, t.title, t.priority, t.status, t.notes])).toEqual([
      ['office', 'Walk Pinal garden plots', 'high', 'not_started', ''],
      ['office', 'Order mulch', 'medium', 'not_started', ''],
    ]);
    expect(list[1]?.details).toBe('Ask for two quotes.');
    expect(list[0]?.details).toBeNull();
    expect(list.every((t) => t.progress_id === null)).toBe(true);
  });

  it("uses saved progress for an office task, with the file's current title and priority", () => {
    const saved = progress({
      id: 'p1',
      source: { kind: 'office', task_id: 'mulch' },
      status: 'blocked',
      notes: 'Waiting on vendor.',
    });
    const renamed = office.map((t) =>
      t.id === 'mulch'
        ? { ...t, title: 'Order mulch for LEHR resets', priority: 'high' as const }
        : t,
    );
    const [, mulch] = myTaskList(renamed, [saved], 'r-tl01');
    expect(mulch).toMatchObject({
      key: 'office:mulch',
      progress_id: 'p1',
      title: 'Order mulch for LEHR resets',
      priority: 'high',
      status: 'blocked',
      notes: 'Waiting on vendor.',
    });
  });

  it('keeps progress for a retired task stored but off the list', () => {
    const saved = progress({ id: 'p1', source: { kind: 'office', task_id: 'old' }, notes: 'x' });
    expect(myTaskList(office, [saved], 'r-tl01').some((t) => t.title === 'Old task')).toBe(false);
  });

  it('puts own tasks after office tasks, oldest first, with no priority', () => {
    const list = myTaskList(
      office,
      [
        progress({ id: 'b', source: { kind: 'own', title: 'Second' }, created_at: LATER }),
        progress({ id: 'a', source: { kind: 'own', title: 'First' }, status: 'completed' }),
      ],
      'r-tl01',
    );
    expect(list.slice(2).map((t) => [t.kind, t.key, t.title, t.priority, t.status])).toEqual([
      ['own', 'a', 'First', null, 'completed'],
      ['own', 'b', 'Second', null, 'not_started'],
    ]);
  });

  it("ignores another role's progress", () => {
    const list = myTaskList(
      office,
      [
        progress({ id: 'x', role_id: 'r-c01', source: { kind: 'own', title: 'Elsewhere' } }),
        progress({
          id: 'y',
          role_id: 'r-c01',
          source: { kind: 'office', task_id: 'mulch' },
          status: 'completed',
        }),
      ],
      'r-tl01',
    );
    expect(list).toHaveLength(2);
    expect(list[1]?.status).toBe('not_started');
  });

  it('is empty with no office tasks and nothing added', () => {
    expect(myTaskList([], [], 'r-tl01')).toEqual([]);
  });
});

describe('taskProgressSummary', () => {
  it('counts completed tasks out of all shown', () => {
    const list = myTaskList(
      office,
      [
        progress({ id: 'p', source: { kind: 'office', task_id: 'mulch' }, status: 'completed' }),
        progress({ id: 'o', source: { kind: 'own', title: 'Mine' }, status: 'blocked' }),
      ],
      'r-tl01',
    );
    expect(taskProgressSummary(list)).toEqual({ done: 1, total: 3 });
  });
});

describe('new progress records', () => {
  it('starts an own task not started, with a trimmed title', () => {
    expect(newOwnTask('r-tl01', '  Fix trailer hitch ', 'id-1', NOW)).toEqual({
      id: 'id-1',
      role_id: 'r-tl01',
      source: { kind: 'own', title: 'Fix trailer hitch' },
      status: 'not_started',
      notes: '',
      created_at: NOW,
      updated_at: NOW,
    });
  });

  it('starts progress for an office task the first time it changes', () => {
    expect(officeProgress('r-tl01', 'mulch', 'id-2', NOW)).toEqual({
      id: 'id-2',
      role_id: 'r-tl01',
      source: { kind: 'office', task_id: 'mulch' },
      status: 'not_started',
      notes: '',
      created_at: NOW,
      updated_at: NOW,
    });
  });

  it('needs a title of at most 120 characters', () => {
    expect(ownTitleProblem('   ')).toBe('Enter a task name.');
    expect(ownTitleProblem('x'.repeat(121))).toBe('Keep the task name to 120 characters.');
    expect(ownTitleProblem(' Fix hitch ')).toBeNull();
  });
});
