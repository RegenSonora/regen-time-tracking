// My Tasks (decision 0041): R-TL01's office tasks with their priority, own tasks, status and
// notes saved on the phone, shared as pictures that never cut a note off.
import { expect, test } from '@playwright/test';
import {
  expectAccessible,
  heading,
  noShare,
  readPng,
  setUp,
  sharedFiles,
  stubShare,
  ZONE,
} from './helpers.js';

test.use({ timezoneId: ZONE });

const card = (page: import('@playwright/test').Page, title: string) =>
  page.locator('.task').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

async function addTask(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: 'Add my own task' }).click();
  await expect(async () => {
    await page.getByLabel('Task name').fill(title);
    await expect(page.getByLabel('Task name')).toHaveValue(title, { timeout: 500 });
  }).toPass();
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(card(page, title)).toBeVisible();
}

test('a Team Lead adds tasks, sets status and notes, and finds them after a reload', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-17T09:00:00-07:00') });
  await setUp(page, 'R-TL01');
  const button = page.getByRole('button', { name: /My Tasks/ });
  await expect(button).toContainText('0 of 5 done');
  await button.click();
  await expect(heading(page, 'My Tasks')).toBeVisible();

  // The office's tasks, in file order, each with a priority people can't change.
  await expect(page.locator('.task-title')).toHaveText([
    "Millie's",
    "Mr Medlock's",
    'Garden clean up',
    "Tanae's",
    "Iberrie's Clean up",
  ]);
  await expect(card(page, "Millie's").locator('.prio-high')).toHaveText('High priority');
  await expect(card(page, "Mr Medlock's").locator('.prio-medium')).toHaveText('Medium priority');
  await expect(card(page, "Iberrie's Clean up").locator('.prio-low')).toHaveText('Low priority');
  // The office's notes are the task's own notes: shown in the Notes box, kept through a status
  // change, and the person can edit or delete them.
  const garden = card(page, 'Garden clean up');
  await expect(garden.getByLabel('Notes')).toHaveValue('Complete by Monday for garden party.');
  await garden.getByLabel('Status').selectOption('in_progress');
  await expect(garden.getByLabel('Notes')).toHaveValue('Complete by Monday for garden party.');
  await card(page, "Mr Medlock's").getByLabel('Notes').fill('Gate code is on the fridge.');
  await expect(card(page, "Millie's").getByRole('button', { name: /^Edit/ })).toHaveCount(0);
  await card(page, "Millie's").getByLabel('Status').selectOption('in_progress');

  // A name is needed.
  await page.getByRole('button', { name: 'Add my own task' }).click();
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText('Enter a task name.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await addTask(page, 'Fix trailer hitch');
  await addTask(page, 'Inventory the tool shed');
  const hitch = card(page, 'Fix trailer hitch');
  await expect(hitch.getByText('Added by you')).toBeVisible();
  await hitch.getByLabel('Status').selectOption({ label: 'Blocked' });
  await hitch.getByLabel('Notes').fill('Waiting on a new coupling.\nCall the supplier Friday.');
  await card(page, 'Inventory the tool shed').getByLabel('Status').selectOption('completed');
  await expectAccessible(page, 'My Tasks');

  await page.reload();
  await expect(page.getByRole('button', { name: /My Tasks/ })).toContainText('1 of 7 done');
  await page.getByRole('button', { name: /My Tasks/ }).click();
  await expect(hitch.getByLabel('Status')).toHaveValue('blocked');
  await expect(hitch.getByLabel('Notes')).toHaveValue(
    'Waiting on a new coupling.\nCall the supplier Friday.',
  );
  await expect(card(page, 'Inventory the tool shed').getByLabel('Status')).toHaveValue('completed');
  await expect(card(page, "Millie's").getByLabel('Status')).toHaveValue('in_progress');
  await expect(garden.getByLabel('Notes')).toHaveValue('Complete by Monday for garden party.');
  await expect(card(page, "Mr Medlock's").getByLabel('Notes')).toHaveValue(
    'Gate code is on the fridge.',
  );

  // Deleting the office's notes sticks.
  await garden.getByLabel('Notes').fill('');
  await page.reload();
  await page.getByRole('button', { name: /My Tasks/ }).click();
  await expect(garden.getByLabel('Notes')).toHaveValue('');

  // Rename, then delete with Undo.
  await hitch.getByRole('button', { name: 'Edit Fix trailer hitch' }).click();
  await page.getByLabel('Task name').fill('Fix trailer hitch and lights');
  await page.getByRole('button', { name: 'Save' }).click();
  const renamed = card(page, 'Fix trailer hitch and lights');
  await expect(renamed.getByLabel('Notes')).toHaveValue(/Waiting on a new coupling/);
  await renamed.getByRole('button', { name: /^Edit/ }).click();
  await page.getByRole('button', { name: 'Delete task' }).click();
  await expect(page.getByRole('heading', { name: 'Delete this task?' })).toBeVisible();
  await expectAccessible(page, 'Delete this task?');
  await page.getByRole('button', { name: 'Delete task' }).click();
  await expect(renamed).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(renamed.getByLabel('Status')).toHaveValue('blocked');
});

test('Share progress sends one picture, and more when notes are long', async ({ page }) => {
  await stubShare(page);
  await page.clock.install({ time: new Date('2026-11-17T09:00:00-07:00') });
  await setUp(page, 'R-TL01');
  await page.getByRole('button', { name: /My Tasks/ }).click();
  await addTask(page, 'Fix trailer hitch');

  await page.getByRole('button', { name: 'Share progress' }).click();
  await expect(page.locator('.share-status')).toContainText('Progress shared.');
  let shares = await sharedFiles(page);
  expect(shares.at(-1)?.map((f) => [f.name, f.type])).toEqual([
    ['progress-2026-11-17.png', 'image/png'],
  ]);
  const picture = await readPng(page, shares.at(-1)?.[0]?.bytes ?? []);
  expect([picture.width, picture.height]).toEqual([1080, 1920]);

  const long = Array.from(
    { length: 120 },
    (_, i) => `Shelf ${String(i + 1)}: counted rakes and hoses.`,
  ).join('\n');
  await card(page, 'Fix trailer hitch').getByLabel('Notes').fill(long);
  await page.getByRole('button', { name: 'Share progress' }).click();
  // Count shares in the page; copying every picture out on each poll is slow.
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length),
      {
        timeout: 20_000,
      },
    )
    .toBe(2);
  shares = await sharedFiles(page);
  const names = shares.at(-1)?.map((f) => f.name) ?? [];
  expect(names.length).toBeGreaterThan(1);
  expect(names[0]).toBe('progress-2026-11-17-1.png');
  expect(shares.at(-1)?.every((f) => f.type === 'image/png')).toBe(true);
  const first = await readPng(page, shares.at(-1)?.[0]?.bytes ?? []);
  expect([first.width, first.height]).toEqual([1080, 1920]);
});

test('without file sharing, the picture downloads', async ({ page }) => {
  await noShare(page);
  await page.clock.install({ time: new Date('2026-11-17T09:00:00-07:00') });
  await setUp(page, 'R-TL01');
  await page.getByRole('button', { name: /My Tasks/ }).click();
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.getByRole('button', { name: 'Share progress' }).click();
  await expect(page.locator('.share-status')).toContainText('Picture saved to your downloads.');
  await expect.poll(() => downloads).toEqual(['progress-2026-11-17.png']);
});

test('roles without office tasks have no My Tasks', async ({ page }) => {
  await setUp(page);
  await expect(heading(page, 'Regen Time Tracking')).toBeVisible();
  await expect(page.getByRole('button', { name: /My Tasks/ })).toHaveCount(0);
});
