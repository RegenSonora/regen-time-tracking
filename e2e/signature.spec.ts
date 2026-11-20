// Typed signature (decision 0046): adopt once in Setup or Settings, apply on each preview.
import { expect, test, type Page } from '@playwright/test';
import { readPdf } from '../tests/files/pdf-reader.js';
import {
  addEntry,
  adoptBox,
  expectAccessible,
  heading,
  setUpWithoutRole,
  sharedFiles,
  stubShare,
  ZONE,
} from './helpers.js';

test.use({ timezoneId: ZONE });

/** What a phone set up before decision 0046 has: a profile with no signature. */
async function dropSignature(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('regen-time-tracking');
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['profile'], 'readwrite');
      const all = tx.objectStore('profile').getAll();
      all.onsuccess = () => {
        for (const p of all.result as object[]) {
          tx.objectStore('profile').put({ ...p, signature: null });
        }
      };
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error('write failed'));
      };
    });
    db.close();
  });
  await page.reload();
  await expect(heading(page, 'Regen Time Tracking')).toBeVisible();
}

test('setup waits for the signature to be adopted, and a new name takes it back', async ({
  page,
}) => {
  await page.goto('./');
  await expect(heading(page, 'Set up')).toBeVisible();
  await expect(async () => {
    await page.getByLabel('Your name').fill('Carmen Cruz');
    await page.getByLabel('Initials').fill('cc');
    await expect(page.getByLabel('Your name')).toHaveValue('Carmen Cruz', { timeout: 500 });
  }).toPass();
  await expect(page.getByText('/s/ Carmen Cruz')).toBeVisible();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Check the box to adopt your signature.')).toBeVisible();
  await expect(adoptBox(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(heading(page, 'Set up')).toBeVisible();
  await expectAccessible(page, 'setup with the signature error');

  await adoptBox(page).check();
  await page.getByLabel('Your name').fill('Carmen R. Cruz');
  await expect(page.getByText('/s/ Carmen R. Cruz')).toBeVisible();
  await expect(adoptBox(page)).not.toBeChecked();

  await adoptBox(page).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(heading(page, 'Pick your role')).toBeVisible();
});

test('apply the signature, create the files, and re-share the same signed files', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-02T08:15:00-07:00') });
  await stubShare(page);
  await setUpWithoutRole(page);
  await addEntry(page, { date: '2026-10-30', start: '09:00', end: '10:00' });

  await page.getByRole('button', { name: 'Generate Regen Invoice' }).click();
  await expect(heading(page, 'New invoice')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create invoice files' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply signature' }).click();
  await expect(page.getByText('/s/ Carmen Cruz')).toBeVisible();
  await expect(page.getByText('Signed Nov 2, 2026')).toBeVisible();
  await expectAccessible(page, 'invoice preview, signed');

  // Undo takes it back; apply again to go on.
  await page.getByRole('button', { name: 'Undo signature' }).click();
  await expect(page.getByRole('button', { name: 'Apply signature' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply signature' }).click();
  await page.getByRole('button', { name: 'Create invoice files' }).click();

  await expect(heading(page, 'Invoice created')).toBeVisible();
  await expect(
    page.getByText('Your signature is already on the PDF and the picture.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Share files' }).click();
  await expect(page.getByRole('status')).toHaveText('Files shared.');
  const [first] = await sharedFiles(page);
  const pdf = await readPdf(new Uint8Array(first?.[0]?.bytes ?? []));
  const page1 = pdf[0]?.text ?? '';
  expect(page1).toContain('/s/ Carmen Cruz');
  expect(page1).toContain('Signed electronically in Regen Time Tracking');
  expect(page1).toContain('Date Nov 2, 2026');
  // Only the reviewer's box is left to sign.
  expect(page1.split('Sign here')).toHaveLength(2);

  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /Past invoices 1 invoice/ }).click();
  await page.getByRole('button', { name: /CC-\d{4}-001/ }).click();
  await page.getByRole('button', { name: 'Share files' }).click();
  await expect(page.getByRole('status')).toHaveText('Files shared.');
  const [, again] = await sharedFiles(page);
  expect(again).toEqual(first);
});

test('a phone set up earlier adopts its signature in Settings before the next invoice', async ({
  page,
}) => {
  await setUpWithoutRole(page);
  await dropSignature(page);
  await addEntry(page, { date: '2026-10-30', start: '09:00', end: '10:00' });

  await page.getByRole('button', { name: 'Generate Regen Invoice' }).click();
  const gated = page.getByRole('button', { name: 'Add signature in Settings' });
  await expect(gated).toHaveClass(/btn-gated/);
  await expect(page.getByRole('button', { name: 'Apply signature' })).toHaveCount(0);
  await expectAccessible(page, 'invoice preview, no signature');

  await gated.click();
  await expect(heading(page, 'Settings')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your signature' })).toBeInViewport();
  await page.getByRole('button', { name: 'Adopt signature' }).click();
  await expect(page.getByText('Check the box to adopt your signature.')).toBeVisible();
  await adoptBox(page).check();
  await page.getByRole('button', { name: 'Adopt signature' }).click();
  await expect(page.getByText(/^Adopted /)).toBeVisible();
  await expectAccessible(page, 'settings with a signature');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(heading(page, 'New invoice')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply signature' })).toBeVisible();
});

test('changing the name in Settings removes the signature until it is adopted again', async ({
  page,
}) => {
  await setUpWithoutRole(page);
  await addEntry(page, { date: '2026-10-30', start: '09:00', end: '10:00' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('/s/ Carmen Cruz')).toBeVisible();
  await page.getByLabel('Your name').fill('Carmen Ruiz');
  await expect(
    page.getByText('Saving your new name removes this signature. Adopt it again after.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(heading(page, 'Regen Time Tracking')).toBeVisible();

  await page.getByRole('button', { name: 'Generate Regen Invoice' }).click();
  await expect(page.getByRole('button', { name: 'Add signature in Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Add signature in Settings' }).click();
  await expect(page.getByText('/s/ Carmen Ruiz')).toBeVisible();
});

test('after midnight the signature is applied again, so it is dated the invoice date', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-02T23:40:00-07:00') });
  await stubShare(page);
  await setUpWithoutRole(page);
  await addEntry(page, { date: '2026-10-30', start: '09:00', end: '10:00' });

  await page.getByRole('button', { name: 'Generate Regen Invoice' }).click();
  await page.getByRole('button', { name: 'Apply signature' }).click();
  await expect(page.getByText('Signed Nov 2, 2026')).toBeVisible();

  // Past midnight: nothing is created and the signature is taken back.
  await page.clock.fastForward('00:30:00');
  await page.getByRole('button', { name: 'Create invoice files' }).click();
  await expect(page.getByText("It's a new day. Apply your signature again.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create invoice files' })).toHaveCount(0);
  await expect(heading(page, 'New invoice')).toBeVisible();

  await page.getByRole('button', { name: 'Apply signature' }).click();
  await expect(page.getByText('Signed Nov 3, 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Create invoice files' }).click();
  await expect(heading(page, 'Invoice created')).toBeVisible();
  await page.getByRole('button', { name: 'Share files' }).click();
  await expect(page.getByRole('status')).toHaveText('Files shared.');
  const [files] = await sharedFiles(page);
  const page1 = (await readPdf(new Uint8Array(files?.[0]?.bytes ?? [])))[0]?.text ?? '';
  expect(page1).toContain('Invoice date Nov 3, 2026');
  expect(page1).toContain('Date Nov 3, 2026');
  expect(page1).not.toContain('Nov 2, 2026');
});
