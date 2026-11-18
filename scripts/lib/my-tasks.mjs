// Validates src/roles/my-tasks.json against schemas/my-tasks.schema.json, then against roles.json
// (decision 0041). Every problem names the role and task in plain words.
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { readJson } from './json.mjs';

/**
 * @typedef {{ id: string, title: string, priority: string, details?: string, retired?: true }} Task
 * @typedef {{ roles: Record<string, Task[]> }} MyTasksFile
 * @typedef {{ roles: { id: string, code: string }[] }} RolesFile
 */

/**
 * Check a my-tasks file against the roles file.
 * @param {unknown} data my-tasks file contents
 * @param {unknown} rolesFile roles file contents, already valid
 * @param {unknown} schema schemas/my-tasks.schema.json
 * @returns {string[]} problems
 */
export function checkMyTasksData(data, rolesFile, schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(/** @type {object} */ (schema));
  if (!validate(data)) {
    return (validate.errors ?? []).map((error) => {
      const message = error.message ?? 'is invalid';
      const [, list, roleId, index, ...rest] = error.instancePath.split('/');
      if (list === 'roles' && roleId !== undefined && index !== undefined) {
        const field = rest.join(' ');
        return `role ${roleId}: task ${String(Number(index) + 1)} ${field ? `${field} ` : ''}${message}`;
      }
      return `${error.instancePath || '/'} ${message}`;
    });
  }
  const file = /** @type {MyTasksFile} */ (data);
  const roles = new Map(/** @type {RolesFile} */ (rolesFile).roles.map((r) => [r.id, r]));
  /** @type {string[]} */
  const problems = [];
  for (const [roleId, tasks] of Object.entries(file.roles)) {
    const role = roles.get(roleId);
    if (!role) {
      problems.push(`role ${roleId}: no role with this id in roles.json`);
      continue;
    }
    const seen = new Set();
    for (const task of tasks) {
      if (seen.has(task.id)) problems.push(`role ${role.code}: task "${task.id}" is listed twice`);
      seen.add(task.id);
    }
  }
  return problems;
}

/**
 * Check src/roles/my-tasks.json against the schema and roles.json.
 * @param {string} root repository root
 * @returns {string[]} problems, each prefixed with "my-tasks.json: "
 */
export function checkMyTasks(root) {
  let data;
  try {
    data = readJson(join(root, 'src', 'roles', 'my-tasks.json'));
  } catch (error) {
    return [`my-tasks.json: not valid JSON (${String(error)})`];
  }
  const rolesFile = readJson(join(root, 'src', 'roles', 'roles.json'));
  const schema = readJson(join(root, 'schemas', 'my-tasks.schema.json'));
  return checkMyTasksData(data, rolesFile, schema).map((p) => `my-tasks.json: ${p}`);
}
