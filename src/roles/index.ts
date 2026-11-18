// The roles and shared count list this release ships (decisions 0027, 0029). The build validates
// roles.json against schemas/roles.schema.json and the funding sources, so the cast is safe.
import { myTasksFor, type MyTasksFile, type OfficeTask } from '../core/my-tasks';
import { resolveRole } from '../core/roles';
import type { Role, RolesFile } from '../core/types';
import myTasksFile from './my-tasks.json';
import rolesFile from './roles.json';

export const ROLES_FILE = rolesFile as RolesFile;
export const ROLES = ROLES_FILE.roles;
export const COUNT_DEFS = ROLES_FILE.counts;

/** The office's My Tasks per role (decision 0041), validated at build time like roles.json. */
export const MY_TASKS_FILE = myTasksFile as MyTasksFile;

/** The role's office tasks, or null when the role has no My Tasks. */
export function officeTasksFor(roleId: string | null): OfficeTask[] | null {
  return myTasksFor(MY_TASKS_FILE, roleId);
}

/** The role a stored role id means now (following `replaced_by`); null for none or unknown. */
export function findRole(id: string | null): Role | null {
  return id === null ? null : (resolveRole(ROLES, id) ?? null);
}
