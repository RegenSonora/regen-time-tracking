// Fails when a funding source file does not match schemas/funding-source.schema.json, or
// src/roles/roles.json does not match schemas/roles.schema.json and the source files, or
// src/roles/my-tasks.json does not match schemas/my-tasks.schema.json and the roles (decision 0041).
import { join } from 'node:path';
import { checkFundingSources } from './lib/funding-sources.mjs';
import { checkMyTasks } from './lib/my-tasks.mjs';
import { checkRoles } from './lib/roles.mjs';

const root = join(import.meta.dirname, '..');
const sourceProblems = checkFundingSources(root);
const roleProblems = sourceProblems.length ? [] : checkRoles(root);
const problems = [
  ...sourceProblems,
  ...roleProblems,
  ...(sourceProblems.length || roleProblems.length ? [] : checkMyTasks(root)),
];
if (problems.length) {
  console.error(`Funding source and role problems:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Funding source and role files are valid.');
