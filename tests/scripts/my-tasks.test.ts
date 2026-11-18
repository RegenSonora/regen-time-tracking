// The office's task file (decision 0041): schema, roles it names, unique task ids.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJson } from '../../scripts/lib/json.mjs';
import { checkMyTasks, checkMyTasksData } from '../../scripts/lib/my-tasks.mjs';

const root = join(import.meta.dirname, '..', '..');
const schema = readJson(join(root, 'schemas', 'my-tasks.schema.json'));
const rolesFile = readJson(join(root, 'src', 'roles', 'roles.json'));

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Task ${id}`,
  priority: 'medium',
  ...extra,
});
const file = (roles: Record<string, unknown[]>) => ({ format_version: 1, version: 1, roles });
const check = (data: unknown) => checkMyTasksData(data, rolesFile, schema);

describe('my-tasks.json', () => {
  it('the shipped file is valid and turns on My Tasks for R-TL01', () => {
    expect(checkMyTasks(root)).toEqual([]);
    const shipped = readJson(join(root, 'src', 'roles', 'my-tasks.json')) as {
      roles: Record<string, unknown>;
    };
    expect(Object.keys(shipped.roles)).toEqual(['r-tl01']);
  });

  it('accepts tasks with each priority, details and retired', () => {
    expect(
      check(
        file({
          'r-tl01': [
            task('a', { priority: 'low' }),
            task('b', { priority: 'high', details: 'Before the rains.' }),
            task('c', { retired: true }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('accepts an empty list', () => {
    expect(check(file({ 'r-tl01': [] }))).toEqual([]);
  });

  it('requires a priority of low, medium or high', () => {
    const noPriority: Record<string, unknown> = task('a');
    delete noPriority['priority'];
    expect(check(file({ 'r-tl01': [noPriority] }))).toEqual([
      "role r-tl01: task 1 must have required property 'priority'",
    ]);
    expect(check(file({ 'r-tl01': [task('a', { priority: 'urgent' })] }))).toEqual([
      'role r-tl01: task 1 priority must be equal to one of the allowed values',
    ]);
  });

  it('refuses a blank or padded title and unknown fields', () => {
    expect(check(file({ 'r-tl01': [task('a', { title: ' Walk ' })] }))).toHaveLength(1);
    expect(check(file({ 'r-tl01': [task('a', { status: 'done' })] }))).toEqual([
      'role r-tl01: task 1 must NOT have additional properties',
    ]);
  });

  it('refuses a role that is not in roles.json', () => {
    expect(check(file({ 'r-zz99': [] }))).toEqual([
      'role r-zz99: no role with this id in roles.json',
    ]);
  });

  it('refuses a task id listed twice', () => {
    expect(check(file({ 'r-tl01': [task('a'), task('a', { retired: true })] }))).toEqual([
      'role R-TL01: task "a" is listed twice',
    ]);
  });
});
