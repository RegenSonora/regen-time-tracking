// The Share progress picture (decision 0041): every task with its priority, status and wrapped
// notes, laid out as shapes for src/ui/page-image.ts to paint. Each page is 360 × 640 points,
// painted at 3 × as 1080 × 1920 pixels. Nothing is cut off: tasks that don't fit continue on the
// next page.
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type MyTask,
  type TaskPriority,
} from '../../core/my-tasks';
import { textWidth, wrapText, type FontName } from '../pdf/fonts';
import type { Shape } from '../pdf/writer';
import { longDate } from '../text';

export const PROGRESS_PAGE = { width: 360, height: 640 } as const;
/** 3 × 360 × 640 points = 1080 × 1920 pixels. */
export const PROGRESS_SCALE = 3;

const MARGIN = 20;
const CONTENT = PROGRESS_PAGE.width - 2 * MARGIN;
/** Room kept at the bottom for "Page n of N". */
const BOTTOM = PROGRESS_PAGE.height - 36;

/** Light fill and dark text per priority, the same colors as the screen (light mode). */
export const PRIORITY_COLORS: Record<TaskPriority, { fill: string; text: string }> = {
  high: { fill: '#fdecea', text: '#7a1a10' },
  medium: { fill: '#fff4dc', text: '#5c3b00' },
  low: { fill: '#dcefd0', text: '#2e5a1f' },
};

export interface ProgressDetails {
  name: string;
  /** "R-TL01 · Resilience Team Lead" */
  role: string;
  /** YYYY-MM-DD, the day it is shared. */
  date: string;
}

export interface ProgressPage {
  width: number;
  height: number;
  shapes: Shape[];
}

const TITLE = { font: 'bold' as FontName, size: 11, lead: 14 };
const DETAIL = { font: 'regular' as FontName, size: 8.5, lead: 11 };
const NOTE = { font: 'regular' as FontName, size: 10, lead: 13 };
const PILL = { font: 'bold' as FontName, size: 8, h: 13, pad: 5 };

/** One unbreakable piece of a task, drawn at the top-left y it is given. */
interface Row {
  height: number;
  draw(y: number, out: Shape[]): void;
  /** Rows that must stay with the next one (a title stays with its labels). */
  keep?: boolean;
}

function text(
  out: Shape[],
  x: number,
  baseline: number,
  value: string,
  font: FontName,
  size: number,
  gray: number,
  color?: string,
) {
  out.push({
    kind: 'text',
    x,
    y: baseline,
    text: value,
    font,
    size,
    gray,
    width: textWidth(value, font, size),
    ...(color && { color }),
  });
}

/** A rounded-looking label: a filled box with bold text. Returns its width. */
function pill(
  out: Shape[],
  x: number,
  top: number,
  label: string,
  colors: { fill: string; text: string } | null,
): number {
  const w = textWidth(label, PILL.font, PILL.size) + 2 * PILL.pad;
  out.push({
    kind: 'rect',
    x,
    y: top,
    w,
    h: PILL.h,
    width: 0.75,
    gray: 0.55,
    fill: 0.92,
    ...(colors && { fillColor: colors.fill }),
    stroke: colors === null,
  });
  text(out, x + PILL.pad, top + 9.5, label, PILL.font, PILL.size, 0.1, colors?.text);
  return w;
}

function lineRows(
  value: string,
  style: { font: FontName; size: number; lead: number },
  gray: number,
  keep = false,
): Row[] {
  return wrapText(value, style.font, style.size, CONTENT).map((line) => ({
    height: style.lead,
    keep,
    draw(y, out) {
      text(out, MARGIN, y + style.size, line, style.font, style.size, gray);
    },
  }));
}

function taskRows(task: MyTask): Row[] {
  const rows: Row[] = lineRows(task.title, TITLE, 0, true);
  rows.push({
    height: PILL.h + 6,
    draw(y, out) {
      let x = MARGIN;
      if (task.priority) {
        x +=
          pill(
            out,
            x,
            y + 2,
            `${PRIORITY_LABELS[task.priority]} priority`,
            PRIORITY_COLORS[task.priority],
          ) + 6;
      } else {
        x += pill(out, x, y + 2, 'Added by me', null) + 6;
      }
      pill(out, x, y + 2, STATUS_LABELS[task.status], null);
    },
  });
  if (task.details) rows.push(...lineRows(task.details, DETAIL, 0.35));
  if (task.notes.trim()) rows.push(...lineRows(task.notes, NOTE, 0.1));
  return rows;
}

function header(out: Shape[], details: ProgressDetails): number {
  text(out, MARGIN, 38, `Progress · ${longDate(details.date)}`, 'bold', 16, 0);
  text(out, MARGIN, 54, `${details.name} · ${details.role}`, 'regular', 9, 0.3);
  out.push({ kind: 'line', x1: MARGIN, y1: 64, x2: MARGIN + CONTENT, y2: 64, width: 1, gray: 0.7 });
  return 76;
}

/**
 * The pictures to share: one page, or more when the tasks don't fit. Every line of every note is
 * on some page; a task split across pages repeats its title with "(continued)".
 */
export function progressPages(tasks: readonly MyTask[], details: ProgressDetails): ProgressPage[] {
  const pages: Shape[][] = [];
  let out: Shape[] = [];
  let y = header(out, details);
  const newPage = () => {
    pages.push(out);
    out = [];
    y = header(out, details);
  };

  if (tasks.length === 0) {
    text(out, MARGIN, y + 12, 'No tasks yet.', 'regular', 11, 0.3);
  }

  tasks.forEach((task, index) => {
    if (index > 0) {
      // A rule between tasks, unless this one starts a page.
      if (y + 14 > BOTTOM) newPage();
      else {
        const ruleY = y + 6;
        out.push({
          kind: 'line',
          x1: MARGIN,
          y1: ruleY,
          x2: MARGIN + CONTENT,
          y2: ruleY,
          width: 0.5,
          gray: 0.8,
        });
        y += 14;
      }
    }
    const rows = taskRows(task);
    let started = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      // Keep the title lines and labels together where they fit on a page.
      let need = row.height;
      for (let j = i; rows[j]?.keep && j + 1 < rows.length; j++) need += rows[j + 1]?.height ?? 0;
      if (y + need > BOTTOM && y > 76) {
        newPage();
        if (started) {
          const cont = `${task.title} (continued)`;
          for (const r of lineRows(cont, DETAIL, 0.35)) {
            r.draw(y, out);
            y += r.height;
          }
          y += 2;
        }
      }
      row.draw(y, out);
      y += row.height;
      started = true;
    }
  });
  pages.push(out);

  const total = pages.length;
  return pages.map((shapes, i) => {
    if (total > 1) {
      const label = `Page ${String(i + 1)} of ${String(total)}`;
      const size = 8;
      const w = textWidth(label, 'regular', size);
      text(shapes, MARGIN + CONTENT - w, PROGRESS_PAGE.height - 16, label, 'regular', size, 0.35);
    }
    return { width: PROGRESS_PAGE.width, height: PROGRESS_PAGE.height, shapes };
  });
}

/** progress-2026-11-17.png, or progress-2026-11-17-1.png … when there are several pages. */
export function progressPngNames(date: string, pages: number): string[] {
  if (pages <= 1) return [`progress-${date}.png`];
  return Array.from({ length: pages }, (_, i) => `progress-${date}-${String(i + 1)}.png`);
}
