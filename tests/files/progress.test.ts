// The Share progress picture (decision 0041): wrapping, height limit, nothing cut off.
import { describe, expect, it } from 'vitest';
import type { MyTask } from '../../src/core/my-tasks';
import { wrapText } from '../../src/files/pdf/fonts';
import {
  PRIORITY_COLORS,
  PROGRESS_PAGE,
  PROGRESS_SCALE,
  progressPages,
  progressPngNames,
  type ProgressPage,
} from '../../src/files/report/progress';

const details = { name: 'Jordan Reyes', role: 'R-TL01 · Resilience Team Lead', date: '2026-11-17' };

const task = (over: Partial<MyTask> = {}): MyTask => ({
  key: 'office:walk',
  kind: 'office',
  task_id: 'walk',
  title: 'Walk Pinal garden plots',
  details: null,
  priority: 'high',
  status: 'in_progress',
  notes: '',
  progress_id: null,
  ...over,
});

const texts = (page: ProgressPage) => page.shapes.flatMap((s) => (s.kind === 'text' ? [s] : []));
const allText = (pages: ProgressPage[]) => pages.flatMap((p) => texts(p).map((t) => t.text));

const LONG = Array.from(
  { length: 140 },
  (_, i) => `Line ${String(i + 1)} of the notes went fine.`,
).join('\n');

describe('progress pictures', () => {
  it('are 1080 × 1920 pixels', () => {
    expect(PROGRESS_PAGE.width * PROGRESS_SCALE).toBe(1080);
    expect(PROGRESS_PAGE.height * PROGRESS_SCALE).toBe(1920);
  });

  it('show the header, each task, its priority in words and color, status and notes', () => {
    const pages = progressPages(
      [
        task({ notes: 'North beds done.' }),
        task({
          key: 'own1',
          kind: 'own',
          task_id: null,
          title: 'Fix hitch',
          priority: null,
          status: 'completed',
        }),
      ],
      details,
    );
    expect(pages).toHaveLength(1);
    const words = allText(pages);
    expect(words).toEqual(
      expect.arrayContaining([
        'Progress · Nov 17, 2026',
        'Jordan Reyes · R-TL01 · Resilience Team Lead',
        'Walk Pinal garden plots',
        'High priority',
        'In progress',
        'North beds done.',
        'Fix hitch',
        'Added by me',
        'Completed',
      ]),
    );
    expect(words.some((w) => w.startsWith('Page '))).toBe(false);
    const high = texts(must(pages[0])).find((t) => t.text === 'High priority');
    expect(high?.color).toBe(PRIORITY_COLORS.high.text);
    const fills = must(pages[0]).shapes.flatMap((s) =>
      s.kind === 'rect' && s.fillColor ? [s.fillColor] : [],
    );
    expect(fills).toEqual([PRIORITY_COLORS.high.fill]);
  });

  it('color each priority differently', () => {
    const colors = new Set(Object.values(PRIORITY_COLORS).map((c) => c.fill));
    expect(colors.size).toBe(3);
    for (const priority of ['low', 'medium'] as const) {
      const [page] = progressPages([task({ priority })], details);
      const label = texts(must(page)).find((t) => t.text.endsWith(' priority'));
      expect(label?.color).toBe(PRIORITY_COLORS[priority].text);
    }
  });

  it('wrap long text to the width and keep every word', () => {
    const notes = `${'Watered the beds and checked the drip lines '.repeat(12)}Superlongwordwithoutanyspaces${'x'.repeat(80)}`;
    const [page] = progressPages(
      [task({ notes, details: 'Ask Chris before buying anything over $200.' })],
      details,
    );
    for (const t of texts(must(page)))
      expect(t.x + t.width).toBeLessThanOrEqual(PROGRESS_PAGE.width - 20 + 0.001);
    const noteLines = wrapText(notes, 'regular', 10, PROGRESS_PAGE.width - 40);
    expect(noteLines.length).toBeGreaterThan(5);
    expect(allText([must(page)])).toEqual(expect.arrayContaining(noteLines));
  });

  it('continue on more pages instead of cutting long notes off', () => {
    const pages = progressPages(
      [task({ notes: LONG }), task({ key: 'office:b', title: 'Second task' })],
      details,
    );
    expect(pages.length).toBeGreaterThan(1);
    const words = allText(pages);
    for (let i = 1; i <= 140; i++)
      expect(words).toContain(`Line ${String(i)} of the notes went fine.`);
    expect(words).toContain('Second task');
    expect(words).toContain('Walk Pinal garden plots (continued)');
    pages.forEach((page, i) => {
      expect(page).toMatchObject({ width: 360, height: 640 });
      expect(words).toContain(`Page ${String(i + 1)} of ${String(pages.length)}`);
      for (const t of texts(page)) expect(t.y).toBeLessThanOrEqual(PROGRESS_PAGE.height - 10);
      // Body text stays above the page number.
      for (const t of texts(page).filter((x) => !x.text.startsWith('Page '))) {
        expect(t.y).toBeLessThan(PROGRESS_PAGE.height - 30);
      }
    });
  });

  it('say so when there are no tasks', () => {
    const pages = progressPages([], details);
    expect(pages).toHaveLength(1);
    expect(allText(pages)).toContain('No tasks yet.');
  });
});

describe('progressPngNames', () => {
  it('names one picture by date, several by number', () => {
    expect(progressPngNames('2026-11-17', 1)).toEqual(['progress-2026-11-17.png']);
    expect(progressPngNames('2026-11-17', 2)).toEqual([
      'progress-2026-11-17-1.png',
      'progress-2026-11-17-2.png',
    ]);
  });
});

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing');
  return value;
}
