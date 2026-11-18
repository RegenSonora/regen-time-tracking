import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJson } from '../../scripts/lib/json.mjs';
import { checkRoles, checkRolesData, makeRolesValidator } from '../../scripts/lib/roles.mjs';

interface RoleTask {
  id: string;
  count_ids: string[];
  flat_rate?: { count_id: string; cents_per_unit: number };
}
interface RoleLine {
  id: string;
  tasks: RoleTask[];
}
interface Funding {
  source_id: string;
  rate_cents?: number;
  nte_cents?: number;
  rate_step?: { after_quarters: number; rate_cents: number };
  ends?: string;
  budget_lines: RoleLine[];
}
interface Role {
  id: string;
  code: string;
  name: string;
  employment: string;
  chw: boolean;
  certification_step?: { after_quarters: number; name: string };
  retired?: boolean;
  replaced_by?: string;
  funding: Funding[];
}
interface Count {
  id: string;
  label: string;
  unit?: string;
  step?: string;
  retired?: boolean;
}
interface RolesFile {
  format_version: number;
  version: number;
  counts: Count[];
  roles: Role[];
}

const root = join(import.meta.dirname, '..', '..');
const rolesFile = readJson(join(root, 'src', 'roles', 'roles.json')) as RolesFile;
const rolesSchema = readJson(join(root, 'schemas', 'roles.schema.json'));
const validate = makeRolesValidator(rolesSchema);
type SourceFile = Record<string, unknown> & { id: string; code: string };
const sources = ['tisupp', 'regen-general-operating'].map(
  (id) => readJson(join(root, 'src', 'funding-sources', `${id}.json`)) as SourceFile,
);

function role(code: string): Role {
  const found = rolesFile.roles.find((r) => r.code === code);
  if (!found) throw new Error(`no role ${code}`);
  return found;
}

/** Count labels to ids, in the shared list's order (decision 0029). */
function countIds(labels: string[]): string[] {
  return rolesFile.counts.filter((c) => labels.includes(c.label)).map((c) => c.id);
}

/** Every count ever released, by id. Never remove or relabel one (decision 0029). */
const RELEASED_COUNTS: Record<string, string> = {
  contacts: 'Contacts',
  referrals_given: 'Referrals given',
  referral_followups: 'Referral follow-ups',
  rides_provided: 'Rides provided',
  applications_completed: 'Applications completed',
  client_goals_achieved: 'Client goals achieved',
  quick_wins_provided: 'Quick wins provided',
  screenings_conducted: 'Screenings conducted',
  applications_approved: 'Applications approved',
  trailer_loads_removed: 'Trailer loads removed',
  assessments_completed: 'Assessments completed',
  lehr_resets_completed: 'LEHR resets completed',
  plants_propagated: 'Plants propagated',
  trees_planted: 'Trees planted',
  trees_removed: 'Trees removed',
  water_capacity_added: 'Water capacity added',
  grow_space_added: 'Grow space added',
  certifications_earned: 'Certifications earned',
};

/** Roles plan Part 2: CHW Trainee tasks (TISUPP ids, in TISUPP order) and their counts. */
const CHW_TRAINEE_TASKS: [string, string[]][] = [
  ['outreach', ['Contacts']],
  ['interview-and-intake', ['Screenings conducted', 'Applications completed']],
  [
    'screening-and-referrals',
    ['Referrals given', 'Screenings conducted', 'Referral follow-ups', 'Applications completed'],
  ],
  ['resource-research', ['Referral follow-ups', 'Contacts']],
  [
    'resource-acquisition',
    [
      'Quick wins provided',
      'Applications approved',
      'Client goals achieved',
      'Applications completed',
      'Rides provided',
      'Referral follow-ups',
      'Referrals given',
      'Contacts',
    ],
  ],
  [
    'application-assistance',
    [
      'Applications completed',
      'Applications approved',
      'Referrals given',
      'Client goals achieved',
      'Quick wins provided',
    ],
  ],
  [
    'transportation',
    ['Rides provided', 'Quick wins provided', 'Client goals achieved', 'Applications completed'],
  ],
  [
    'advocacy',
    [
      'Quick wins provided',
      'Referral follow-ups',
      'Referrals given',
      'Client goals achieved',
      'Screenings conducted',
      'Applications approved',
    ],
  ],
  ['conversational-support', ['Contacts', 'Quick wins provided', 'Referrals given']],
  [
    'supporting-client-self-efficacy',
    [
      'Client goals achieved',
      'Referrals given',
      'Applications completed',
      'Quick wins provided',
      'Applications approved',
    ],
  ],
  ['technical-assistance', ['Client goals achieved', 'Quick wins provided']],
  ['client-or-community-workshops', ['Contacts']],
  [
    'client-check-in',
    [
      'Client goals achieved',
      'Quick wins provided',
      'Referrals given',
      'Referral follow-ups',
      'Applications completed',
    ],
  ],
  [
    'client-follow-up',
    [
      'Referral follow-ups',
      'Client goals achieved',
      'Applications approved',
      'Quick wins provided',
      'Applications completed',
      'Referrals given',
    ],
  ],
  ['re-screening', ['Referrals given', 'Screenings conducted', 'Contacts']],
  // "Individual and community assessment" keeps its old id (decision 0019).
  ['planning-and-conducting-surveys', ['Contacts', 'Screenings conducted', 'Referrals given']],
  ['documentation', []],
  ['data-analysis-and-reporting', []],
  ['developing-tools-processes', []],
  ['meetings', []],
  ['training-continuing-education', []],
];

/** Roles plan Part 2: Resilience Team Lead lines, tasks and counts on REGEN-GO. */
const TEAM_LEAD_LINES: [string, [string, string[]][]][] = [
  [
    'fire-risk-reduction-work',
    [
      ['firewise-assessing', ['Assessments completed', 'Trailer loads removed']],
      ['residential-fuel-reduction', ['Trailer loads removed']],
      ['municipal-fuel-reduction', ['Trailer loads removed']],
      ['dump-runs', ['Trailer loads removed']],
    ],
  ],
  [
    'maintenance-labor',
    [
      ['lehr-maintenance', ['LEHR resets completed']],
      ['pinal-garden-maintenance', []],
      ['regen-lot-clean-and-maintenance', []],
      ['transport-and-supply-runs', []],
    ],
  ],
  [
    'resilient-home-services-contracting',
    [
      ['plant-propagation', ['Plants propagated']],
      ['tree-planting', ['Trees planted']],
      ['tree-removal', ['Trees removed']],
      ['water-harvesting', ['Water capacity added']],
      ['garden-support', ['Grow space added']],
    ],
  ],
  ['team-development', [['paid-training', ['Certifications earned']]]],
  ['other-contractors', [['other', []]]],
];

// Resilience Contractor lines, in the source's line order (decision 0040).
const CONTRACTOR_LINES: [string, [string, string[]][]][] = [
  [
    'fire-risk-reduction-work',
    [
      ['residential-fuel-reduction', ['Trailer loads removed']],
      ['municipal-fuel-reduction', ['Trailer loads removed']],
      ['dump-runs', ['Trailer loads removed']],
    ],
  ],
  [
    'maintenance-labor',
    [
      ['pinal-garden-maintenance', []],
      ['regen-lot-clean-and-maintenance', []],
      ['lehr-reset', ['LEHRs reset']],
      ['leos-maintenance', []],
    ],
  ],
  [
    'resilient-home-services-contracting',
    TEAM_LEAD_LINES.find(([id]) => id === 'resilient-home-services-contracting')?.[1] ?? [],
  ],
  ['other-contractors', [['other', []]]],
];

// Regen Generalist Contractor lines, in the source's line order (decision 0038).
const GENERALIST_LINES: [string, [string, string[]][]][] = [
  [
    'resilient-home-services-contracting',
    TEAM_LEAD_LINES.find(([id]) => id === 'resilient-home-services-contracting')?.[1] ?? [],
  ],
  ['other-contractors', [['other', []]]],
  [
    'leos',
    [
      ['hosting-open-hours', ['People helped at open hours']],
      ['cooking-monday-breakfast', ['Meals cooked']],
      ['hosting-monday-breakfast', ['People at events hosted']],
      ['serving-monday-dinner', ['Meals served']],
      ['cooking-wednesday-dinner', ['Meals cooked']],
      ['serving-wednesday-dinner', ['Meals served']],
      ['hosting-wednesday-dinner', ['People at events hosted']],
      ['hosting-special-event', ['Special events hosted', 'People at events hosted']],
      ['leos-internal-meetings', []],
      ['leos-maintenance', []],
      ['leos-marketing', ['Flyers posted']],
      ['leos-other', []],
    ],
  ],
  [
    'eat-local-network',
    [
      ['eat-local-forum-event-assistance', ['Event attendees']],
      ['full-moon-garden-party-event-support', ['Event attendees']],
      ['green-thumb-warriors-event-support', ['Event attendees']],
      ['gleaning', ['Food gleaned']],
      ['food-processing', ['Food processed']],
      ['eat-local-marketing', ['Flyers posted']],
      ['lehr-reset', ['LEHRs reset', 'Soil harvested']],
      ['garden-maintenance', []],
      ['lehr-maintenance', ['LEHR homes supported']],
      ['eat-local-grower-support', ['Growers supported']],
      ['lehr-installation', ['LEHRs installed']],
      ['eat-local-network-other', []],
    ],
  ],
  [
    'community-care-work',
    [
      [
        'domestic-support',
        ['Homes cleaned', 'In-home meals made', 'People helped with domestic support'],
      ],
      [
        'transportation-service',
        [
          'Rides provided',
          'Medical appointments driven to',
          'Miles driven',
          'Resource appointments driven to',
          'Rides dispatched',
        ],
      ],
      ['other', []],
    ],
  ],
];

describe('roles file (roles plan Part 2, decisions 0027, 0029)', () => {
  it('matches the schema', () => {
    expect(validate(rolesFile)).toEqual([]);
    expect(rolesFile.format_version).toBe(1);
  });

  it('keeps every released count with its label, in the shared list order', () => {
    const now = Object.fromEntries(rolesFile.counts.map((c) => [c.id, c.label]));
    for (const [id, label] of Object.entries(RELEASED_COUNTS)) expect(now[id], id).toBe(label);
    expect(rolesFile.counts.map((c) => c.id).slice(0, 18)).toEqual(Object.keys(RELEASED_COUNTS));
  });

  it('gives water capacity gallons and grow space square feet', () => {
    const units = rolesFile.counts.filter((c) => c.unit).map((c) => [c.id, c.unit]);
    expect(units).toEqual([
      ['water_capacity_added', 'gal'],
      ['grow_space_added', 'sq ft'],
      ['miles_driven', 'mi'],
      ['resource_value_unlocked', 'dollars'],
      ['food_gleaned', 'lb'],
      ['food_processed', 'lb'],
      ['soil_harvested', 'gal'],
    ]);
  });

  it('ships six active roles: two CHW Trainees, a Certified CHW, the Resilience Team Lead, the Regen Generalist and the Resilience Contractor', () => {
    expect(
      rolesFile.roles.map((r) => [r.id, r.code, r.name, r.employment, r.chw, r.retired ?? false]),
    ).toEqual([
      ['chw-tc01', 'CHW-TC01', 'CHW Trainee (Contractor)', 'contractor', true, false],
      ['chw-te01', 'CHW-TE01', 'CHW Trainee (Employee)', 'employee', true, false],
      ['chw-ce01', 'CHW-CE01', 'Certified CHW (Employee)', 'employee', false, false],
      ['r-tl01', 'R-TL01', 'Resilience Team Lead', 'contractor', false, false],
      ['r-gc01', 'R-GC01', 'Regen Generalist Contractor', 'contractor', false, false],
      ['r-c01', 'R-C01', 'Resilience Contractor', 'contractor', false, false],
    ]);
  });

  it('CHW Trainees bill TISUPP at $20.00, $23.00 after 240 hrs, cert at 480 hrs (0030, 0032)', () => {
    const step = {
      rate_cents: 2000,
      rate_step: { after_quarters: 960, rate_cents: 2300 },
    };
    for (const code of ['CHW-TC01', 'CHW-TE01']) {
      const r = role(code);
      expect(r.certification_step).toEqual({ after_quarters: 1920, name: 'CHW Cert' });
      expect(r.funding[0]).toMatchObject({ source_id: 'tisupp', ...step });
    }
    expect(role('CHW-TC01').funding).toHaveLength(1);
    expect(role('CHW-TC01').funding[0]?.nte_cents).toBe(1032000);
    // CHW-TE01 also bills Regen General Operating, with the same raise (decision 0036).
    expect(role('CHW-TE01').funding).toHaveLength(2);
    expect(role('CHW-TE01').funding[1]).toMatchObject({
      source_id: 'regen-general-operating',
      ...step,
    });
    // Employee roles leave the NTE blank (decision 0031).
    for (const f of role('CHW-TE01').funding) expect(f.nte_cents).toBeUndefined();
  });

  it('CHW Trainees: all 21 TISUPP tasks on CHW experience hours, with their counts', () => {
    const expected = [
      {
        id: 'chw-experience-hours',
        tasks: CHW_TRAINEE_TASKS.map(([id, labels]) => ({ id, count_ids: countIds(labels) })),
      },
    ];
    expect(role('CHW-TC01').funding[0]?.budget_lines).toEqual(expected);
    expect(role('CHW-TE01').funding[0]?.budget_lines).toEqual(expected);
    // The same line and tasks on Regen General Operating (decision 0036).
    expect(role('CHW-TE01').funding[1]?.budget_lines).toEqual(expected);
  });

  it('Resilience Team Lead bills Regen General Operating at $22.00 with no raise or NTE', () => {
    const r = role('R-TL01');
    expect(r.certification_step).toBeUndefined();
    expect(r.funding).toHaveLength(1);
    const [funding] = r.funding;
    expect(funding?.source_id).toBe('regen-general-operating');
    expect(funding?.rate_cents).toBe(2200);
    expect(funding?.rate_step).toBeUndefined();
    expect(funding?.nte_cents).toBeUndefined();
    expect(funding?.budget_lines).toEqual(
      TEAM_LEAD_LINES.map(([id, tasks]) => ({
        id,
        tasks: tasks.map(([task, labels]) => ({ id: task, count_ids: countIds(labels) })),
      })),
    );
  });

  it('Regen Generalist Contractor bills Regen General Operating with no preset rate (0038)', () => {
    const r = role('R-GC01');
    expect(r.certification_step).toBeUndefined();
    expect(r.funding).toHaveLength(1);
    const [funding] = r.funding;
    expect(funding?.source_id).toBe('regen-general-operating');
    expect(funding?.rate_cents).toBeUndefined();
    expect(funding?.rate_step).toBeUndefined();
    expect(funding?.nte_cents).toBeUndefined();
    const plain = funding?.budget_lines.map((l) => ({
      id: l.id,
      tasks: l.tasks.map((t) => ({ id: t.id, count_ids: t.count_ids })),
    }));
    expect(plain).toEqual(
      GENERALIST_LINES.map(([id, tasks]) => ({
        id,
        tasks: tasks.map(([task, labels]) => ({ id: task, count_ids: countIds(labels) })),
      })),
    );
  });

  it('pays the Regen Generalist and Resilience Contractor $140.00 per LEHR reset (0039, 0040)', () => {
    const flatOf = (code: string) =>
      role(code)
        .funding.flatMap((f) => f.budget_lines)
        .flatMap((l) => l.tasks.filter((t) => t.flat_rate).map((t) => [l.id, t.id, t.flat_rate]));
    const rate = { count_id: 'lehrs_reset', cents_per_unit: 14000 };
    expect(flatOf('R-GC01')).toEqual([['eat-local-network', 'lehr-reset', rate]]);
    expect(flatOf('R-C01')).toEqual([['maintenance-labor', 'lehr-reset', rate]]);
    // A count's step never changes after release.
    expect(rolesFile.counts.filter((c) => c.step).map((c) => [c.id, c.step])).toEqual([
      ['lehrs_reset', 'quarter'],
    ]);
    // Every other role is paid by the hour only.
    for (const r of rolesFile.roles.filter((x) => x.id !== 'r-gc01' && x.id !== 'r-c01'))
      for (const f of r.funding)
        for (const l of f.budget_lines)
          for (const t of l.tasks) expect(t.flat_rate, `${r.code} ${t.id}`).toBeUndefined();
  });

  it('Resilience Contractor bills Regen General Operating with no preset rate (0040)', () => {
    const r = role('R-C01');
    expect(r.certification_step).toBeUndefined();
    expect(r.funding).toHaveLength(1);
    const [funding] = r.funding;
    expect(funding?.source_id).toBe('regen-general-operating');
    expect(funding?.rate_cents).toBeUndefined();
    expect(funding?.rate_step).toBeUndefined();
    expect(funding?.nte_cents).toBeUndefined();
    const plain = funding?.budget_lines.map((l) => ({
      id: l.id,
      tasks: l.tasks.map((t) => ({ id: t.id, count_ids: t.count_ids })),
    }));
    expect(plain).toEqual(
      CONTRACTOR_LINES.map(([id, tasks]) => ({
        id,
        tasks: tasks.map(([task, labels]) => ({ id: task, count_ids: countIds(labels) })),
      })),
    );
  });

  it('adds the eight Regen Generalist counts at the end of the list (0038)', () => {
    expect(rolesFile.counts.slice(-8).map((c) => c.label)).toEqual([
      'Flyers posted',
      'Food gleaned',
      'Food processed',
      'LEHRs reset',
      'Soil harvested',
      'LEHR homes supported',
      'Growers supported',
      'LEHRs installed',
    ]);
  });
});

describe('roles schema', () => {
  function changed(change: (copy: RolesFile) => void) {
    const copy = structuredClone(rolesFile);
    change(copy);
    return validate(copy);
  }
  const first = (f: RolesFile) => f.roles[0] as Role;

  it('rejects count ids with hyphens and role ids with underscores', () => {
    expect(changed((f) => ((f.counts[0] as Count).id = 'trees-planted'))).not.toEqual([]);
    expect(changed((f) => (first(f).id = 'chw_tc01'))).not.toEqual([]);
  });

  it('rejects an unknown employment type and an extra field', () => {
    expect(changed((f) => (first(f).employment = 'volunteer'))).not.toEqual([]);
    expect(
      changed((f) => ((first(f) as unknown as Record<string, unknown>)['person'] = 'x')),
    ).not.toEqual([]);
  });

  it('rejects money that is not whole cents', () => {
    expect(changed((f) => ((first(f).funding[0] as Funding).rate_cents = 20.5))).not.toEqual([]);
    expect(changed((f) => ((first(f).funding[0] as Funding).nte_cents = 0))).not.toEqual([]);
  });

  it('rejects empty funding, budget lines and tasks, and accepts a task with no counts', () => {
    expect(changed((f) => (first(f).funding = []))).not.toEqual([]);
    expect(changed((f) => ((first(f).funding[0] as Funding).budget_lines = []))).not.toEqual([]);
    expect(
      changed((f) => (((first(f).funding[0] as Funding).budget_lines[0] as RoleLine).tasks = [])),
    ).not.toEqual([]);
  });

  it('accepts only the quarter step and a flat rate in whole cents (decision 0039)', () => {
    expect(changed((f) => ((f.counts[0] as Count).step = 'half'))).not.toEqual([]);
    expect(changed((f) => ((f.counts[0] as Count).step = 'quarter'))).toEqual([]);
    const t = (f: RolesFile) =>
      (first(f).funding[0] as Funding).budget_lines[0]?.tasks[0] as RoleTask;
    expect(
      changed((f) => (t(f).flat_rate = { count_id: 'contacts', cents_per_unit: 12.5 })),
    ).not.toEqual([]);
    expect(
      changed((f) => (t(f).flat_rate = { count_id: 'contacts', cents_per_unit: 100 })),
    ).toEqual([]);
  });

  it('rejects a blank unit or label, and an end date that is not a date', () => {
    expect(changed((f) => ((f.counts[0] as Count).unit = ''))).not.toEqual([]);
    expect(changed((f) => ((f.counts[0] as Count).label = ' Contacts'))).not.toEqual([]);
    expect(changed((f) => ((first(f).funding[0] as Funding).ends = 'June 30'))).not.toEqual([]);
    expect(changed((f) => ((first(f).funding[0] as Funding).ends = '2027-06-30'))).toEqual([]);
  });
});

describe('build checks against the source files (roles plan R1)', () => {
  /** Problems after one change to copies of the shipped roles and sources. */
  function broken(change: (f: RolesFile, s: SourceFile[]) => void): string[] {
    const copy = structuredClone(rolesFile);
    const sourceCopies = structuredClone(sources);
    change(copy, sourceCopies);
    return checkRolesData(copy, sourceCopies, rolesSchema);
  }
  const byId = (f: RolesFile, id: string) => f.roles.find((r) => r.id === id) as Role;
  const tc = (f: RolesFile) => byId(f, 'chw-tc01');
  const te = (f: RolesFile) => byId(f, 'chw-te01');
  const tl = (f: RolesFile) => byId(f, 'r-tl01');
  const funding = (r: Role) => r.funding[0] as Funding;
  const line = (r: Role) => funding(r).budget_lines[0] as RoleLine;
  const task = (r: Role) => line(r).tasks[0] as RoleTask;
  const source = (s: SourceFile[], id: string) => s.find((x) => x.id === id) as SourceFile;
  /** Drop a count from every task of every role. */
  const unuse = (f: RolesFile, id: string) => {
    for (const r of f.roles)
      for (const fu of r.funding)
        for (const l of fu.budget_lines)
          for (const t of l.tasks) t.count_ids = t.count_ids.filter((c) => c !== id);
  };
  /** A retired copy of R-TL01, for replacement tests. */
  const retiredLead = (f: RolesFile, id: string, replacedBy?: string) => {
    const old: Role = { ...structuredClone(tl(f)), id, code: id.toUpperCase(), retired: true };
    if (replacedBy) old.replaced_by = replacedBy;
    f.roles.push(old);
  };

  it('passes the shipped files', () => {
    expect(checkRoles(root)).toEqual([]);
  });

  it('rejects a duplicate role id or code; a retired role keeps its id', () => {
    expect(broken((f) => (te(f).id = 'chw-tc01'))).toContain(
      'role CHW-TE01: id "chw-tc01" is already used by role CHW-TC01',
    );
    expect(broken((f) => (te(f).code = 'CHW-TC01'))).toContain(
      'role CHW-TC01: code is used by more than one role',
    );
    expect(
      broken((f) => {
        retiredLead(f, 'r-tl00');
        te(f).id = 'r-tl00';
      }),
    ).toContain('role R-TL00: id "r-tl00" is already used by role CHW-TE01');
  });

  it('rejects a reused count id, or a label matching another count, retired ones included', () => {
    expect(broken((f) => f.counts.push({ id: 'contacts', label: 'People reached' }))).toContain(
      'count "contacts": id is used more than once',
    );
    expect(
      broken((f) => f.counts.push({ id: 'trees_planted_2', label: 'trees  Planted' })),
    ).toContain('count "trees_planted_2": label "trees  Planted" matches count "trees_planted"');
    expect(
      broken((f) => {
        (f.counts[3] as Count).retired = true;
        unuse(f, 'rides_provided');
        f.counts.push({ id: 'rides_given', label: 'Rides provided' });
      }),
    ).toContain('count "rides_given": label "Rides provided" matches count "rides_provided"');
  });

  it('rejects a source, line, task or count listed twice in one role', () => {
    expect(broken((f) => tl(f).funding.push(structuredClone(funding(tl(f)))))).toContain(
      'role R-TL01: funding "regen-general-operating" is listed twice',
    );
    expect(broken((f) => funding(tl(f)).budget_lines.push(structuredClone(line(tl(f)))))).toContain(
      'role R-TL01, funding regen-general-operating: budget line "fire-risk-reduction-work" is listed twice',
    );
    expect(broken((f) => line(tc(f)).tasks.push(structuredClone(task(tc(f)))))).toContain(
      'role CHW-TC01, funding tisupp, budget line chw-experience-hours: task "outreach" is listed twice',
    );
    expect(broken((f) => task(tc(f)).count_ids.push('contacts'))).toContain(
      'role CHW-TC01, funding tisupp, budget line chw-experience-hours, task outreach: count "contacts" is listed twice',
    );
  });

  it('rejects a source, budget line, task or count that does not exist', () => {
    expect(broken((f) => (funding(tc(f)).source_id = 'tisup'))).toContain(
      `role CHW-TC01: funding source "tisup" doesn't exist`,
    );
    expect(broken((f) => (line(tc(f)).id = 'chw-hours'))).toContain(
      `role CHW-TC01, funding tisupp: budget line "chw-hours" isn't in TISUPP`,
    );
    expect(broken((f) => (task(tc(f)).id = 'outreech'))).toContain(
      `role CHW-TC01, funding tisupp, budget line chw-experience-hours: task "outreech" isn't in TISUPP`,
    );
    expect(broken((f) => (task(tc(f)).count_ids = ['contact']))).toContain(
      `role CHW-TC01, funding tisupp, budget line chw-experience-hours, task outreach: count "contact" isn't in the count list`,
    );
  });

  it('rejects an active role using a retired count', () => {
    expect(broken((f) => ((f.counts[0] as Count).retired = true))).toContain(
      'role CHW-TC01, funding tisupp, budget line chw-experience-hours, task outreach: count "contacts" is retired',
    );
  });

  it('names the role when a list is empty', () => {
    expect(broken((f) => (tl(f).funding = []))).toContain('role R-TL01: funding is empty');
    expect(broken((f) => (funding(tl(f)).budget_lines = []))).toContain(
      'role R-TL01: funding 1 budget_lines is empty',
    );
    expect(broken((f) => (line(tl(f)).tasks = []))).toContain(
      'role R-TL01: funding 1 budget_lines 1 tasks is empty',
    );
  });

  it('checks replaced_by: only on retired roles, to an active role, with no loop', () => {
    expect(broken((f) => (tl(f).replaced_by = 'chw-tc01'))).toContain(
      `role R-TL01: replaced_by is set but the role isn't retired`,
    );
    expect(
      broken((f) => {
        retiredLead(f, 'r-tl00', 'r-tl02');
      }),
    ).toContain(`role R-TL00: replaced_by "r-tl02" doesn't exist`);
    expect(
      broken((f) => {
        retiredLead(f, 'r-tl00', 'r-tlx');
        retiredLead(f, 'r-tlx', 'r-tl01');
      }),
    ).toContain('role R-TL00: replaced_by "r-tlx" is retired');
    expect(
      broken((f) => {
        retiredLead(f, 'r-tla', 'r-tlb');
        retiredLead(f, 'r-tlb', 'r-tla');
      }),
    ).toContain('role R-TLA: replaced_by forms a loop: r-tla → r-tlb → r-tla');
  });

  it('rejects money that is not whole cents, and an NTE on a source without one', () => {
    expect(broken((f) => (funding(tl(f)).rate_cents = 22.5))).toContain(
      'role R-TL01: funding 1 rate_cents must be integer',
    );
    expect(broken((f) => (funding(tl(f)).nte_cents = 500000))).toContain(
      'role R-TL01, funding regen-general-operating: nte_cents is set but REGEN-GO has no NTE',
    );
  });

  it('rejects an end date outside the source period, or not a real date (decision 0033)', () => {
    const period = `outside TISUPP's period (2026-10-01 to 2027-09-30)`;
    expect(broken((f) => (funding(tc(f)).ends = '2027-12-31'))).toContain(
      `role CHW-TC01, funding tisupp: ends 2027-12-31 is ${period}`,
    );
    expect(broken((f) => (funding(tc(f)).ends = '2026-09-30'))).toContain(
      `role CHW-TC01, funding tisupp: ends 2026-09-30 is ${period}`,
    );
    expect(broken((f) => (funding(tc(f)).ends = '2027-02-30'))).toContain(
      `role CHW-TC01, funding tisupp: ends 2027-02-30 isn't a real date`,
    );
    expect(broken((f) => (funding(tc(f)).ends = '2027-06-30'))).toEqual([]);
    expect(broken((f) => (funding(tl(f)).ends = '2030-01-01'))).toEqual([]);
  });

  it('rejects a certification step on a non-CHW role (decision 0032)', () => {
    expect(
      broken((f) => (tl(f).certification_step = { after_quarters: 1920, name: 'CHW Cert' })),
    ).toContain('role R-TL01: certification_step is only for CHW roles (chw: true)');
  });

  it('rejects an employee role on a source with no employee certification (decision 0031)', () => {
    const missing = `has no employee_certification_text and the role doesn't set one`;
    const noRegenText = (s: SourceFile[]) => {
      delete source(s, 'regen-general-operating')['employee_certification_text'];
    };
    expect(
      broken((f, s) => {
        noRegenText(s);
        tl(f).employment = 'employee';
      }),
    ).toContain(
      `role R-TL01, funding regen-general-operating: employee role, but REGEN-GO ${missing}`,
    );
    expect(
      broken((f, s) => {
        noRegenText(s);
        for (const r of [tl(f), te(f), byId(f, 'chw-ce01')]) {
          r.employment = 'employee';
          (r as unknown as Record<string, unknown>)['employee_certification_text'] = 'I certify.';
        }
      }),
    ).toEqual([]);
    expect(
      broken((_f, s) => {
        delete source(s, 'tisupp')['employee_certification_text'];
      }),
    ).toContain(`role CHW-TE01, funding tisupp: employee role, but TISUPP ${missing}`);
  });

  it('keeps one raise per role: every rate_step on a role must match (decision 0036)', () => {
    const regenOf = (r: Role) => r.funding[1] as Funding;
    expect(
      broken((f) => {
        regenOf(te(f)).rate_step = { after_quarters: 960, rate_cents: 2400 };
      }),
    ).toContain(
      'role CHW-TE01: every rate_step must match; funding regen-general-operating differs',
    );
    expect(
      broken((f) => {
        regenOf(te(f)).rate_step = { after_quarters: 800, rate_cents: 2300 };
      }),
    ).toContain(
      'role CHW-TE01: every rate_step must match; funding regen-general-operating differs',
    );
    expect(
      broken((f) => {
        delete regenOf(te(f)).rate_step;
      }),
    ).toEqual([]);
  });
  it('checks flat rates: a count of the task, contractors only, cents that divide by 4 (0039)', () => {
    const gc = (f: RolesFile) => byId(f, 'r-gc01');
    const reset = (f: RolesFile) =>
      funding(gc(f))
        .budget_lines.flatMap((l) => l.tasks)
        .find((t) => t.id === 'lehr-reset') as RoleTask;
    const at =
      'role R-GC01, funding regen-general-operating, budget line eat-local-network, task lehr-reset';
    expect(
      broken((f) => {
        reset(f).flat_rate = { count_id: 'trees_planted', cents_per_unit: 14000 };
      }),
    ).toContain(`${at}: flat_rate count "trees_planted" isn't one of the task's counts`);
    expect(
      broken((f) => {
        gc(f).employment = 'employee';
        gc(f).funding[0] = { ...funding(gc(f)) };
      }),
    ).toContain(`${at}: flat_rate is only for contractor roles`);
    expect(
      broken((f) => {
        reset(f).flat_rate = { count_id: 'lehrs_reset', cents_per_unit: 14001 };
      }),
    ).toContain(`${at}: flat_rate cents_per_unit must divide by 4 for a quarter-step count`);
    expect(
      broken((f) => {
        const lehrs = f.counts.find((c) => c.id === 'lehrs_reset') as Count;
        delete lehrs.step;
        reset(f).flat_rate = { count_id: 'lehrs_reset', cents_per_unit: 14001 };
      }),
    ).toEqual([]);
  });
});
