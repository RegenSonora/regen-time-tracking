// My Tasks (decision 0041): the office's tasks for the role, each with a priority only the office
// sets, plus tasks the person adds. Status and notes save as they change. Share progress sends a
// picture of every task, on more than one picture when it doesn't fit on one.
import { useState } from 'preact/hooks';
import {
  myTaskList,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_STATUSES,
  type MyTask,
  type TaskStatus,
} from '../../core';
import { PROGRESS_SCALE, progressPages, progressPngNames } from '../../files';
import { officeTasksFor } from '../../roles';
import { phoneNow } from '../../storage';
import { Confirm, Dialog, Field, Page, ToastBar } from '../components';
import { localDateTime } from '../format';
import { pagePng } from '../page-image';
import { shareFiles, type ShareOutcome } from '../share';
import { useApp } from '../store';

const SHARE_STATUS: Record<ShareOutcome, string> = {
  shared: 'Progress shared.',
  cancelled: 'Not shared yet.',
  downloaded: 'Picture saved to your downloads.',
};

/**
 * Notes grow with what is typed, from 3 lines up to 12; longer notes scroll in the box. About 28
 * characters fit on a line at phone width, so wrapped lines count too.
 */
const noteRows = (notes: string) => {
  const lines = notes
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 28)), 0);
  return Math.min(12, Math.max(3, lines + 1));
};

function TaskCard({ task, onEdit }: { task: MyTask; onEdit: () => void }) {
  const { actions } = useApp();
  const id = `task-${task.key.replace(/[^a-z0-9-]/gi, '-')}`;
  return (
    <li class="card task" aria-labelledby={`${id}-title`}>
      <div class="task-head">
        <h2 class="task-title" id={`${id}-title`}>
          {task.title}
        </h2>
        {task.kind === 'own' && (
          <button
            type="button"
            class="txt task-edit"
            aria-label={`Edit ${task.title}`}
            onClick={onEdit}
          >
            Edit
          </button>
        )}
      </div>
      <div class="task-tags">
        {task.priority ? (
          <span class={`prio prio-${task.priority}`}>
            {PRIORITY_LABELS[task.priority]} priority
          </span>
        ) : (
          <span class="prio prio-own">Added by you</span>
        )}
      </div>
      {task.details && <p class="hint task-details">{task.details}</p>}
      <Field label="Status">
        {(p) => (
          <select
            {...p}
            class="inp task-status"
            value={task.status}
            onChange={(e) =>
              void actions.saveTask(task, { status: e.currentTarget.value as TaskStatus })
            }
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Notes">
        {(p) => (
          <textarea
            {...p}
            class="inp inp-area task-notes"
            rows={noteRows(task.notes)}
            value={task.notes}
            onInput={(e) => void actions.saveTask(task, { notes: e.currentTarget.value })}
          />
        )}
      </Field>
    </li>
  );
}

/** Add a task, or rename one the person added. */
function TitleDialog({
  title,
  initial,
  confirm,
  onSave,
  onDelete,
  onClose,
}: {
  title: string;
  initial: string;
  confirm: string;
  onSave: (value: string) => Promise<string | null>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const problem = await onSave(value);
    if (problem) setError(problem);
    else onClose();
  };
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        class="sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Task name" error={error ?? undefined}>
          {(p) => (
            <input
              {...p}
              class="inp"
              type="text"
              maxLength={200}
              autoComplete="off"
              value={value}
              onInput={(e) => {
                setValue(e.currentTarget.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <div class="sheet-actions">
          <button type="submit" class="btn">
            {confirm}
          </button>
          {onDelete && (
            <button type="button" class="txt" onClick={onDelete}>
              Delete task
            </button>
          )}
          <button type="button" class="txt" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function MyTasks() {
  const { data, role, actions } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MyTask | null>(null);
  const [deleting, setDeleting] = useState<MyTask | null>(null);
  const [outcome, setOutcome] = useState<ShareOutcome | 'failed' | null>(null);
  const office = officeTasksFor(role?.id ?? null);
  if (!role || !office) return null;
  const tasks = myTaskList(office, data.task_progress, role.id);

  // Drawn straight from the tap, before any await, so the share sheet keeps the tap's gesture.
  const share = () => {
    actions.dismissToast();
    const date = localDateTime(phoneNow()).date;
    const pages = progressPages(tasks, {
      name: data.profile?.name ?? '',
      role: `${role.code} · ${role.name}`,
      date,
    });
    const names = progressPngNames(date, pages.length);
    const files: File[] = [];
    for (const [i, page] of pages.entries()) {
      const png = pagePng(page, document, PROGRESS_SCALE);
      if (!png) {
        setOutcome('failed');
        return;
      }
      files.push(new File([png], names[i] ?? `progress-${date}.png`, { type: 'image/png' }));
    }
    void shareFiles(files, `Progress ${date}`).then(setOutcome);
  };

  return (
    <Page
      title="My Tasks"
      back
      footer={
        <button type="button" class="btn" onClick={share}>
          Share progress
        </button>
      }
    >
      {tasks.length === 0 ? (
        <p class="empty">No tasks yet. Add your own, or check back after the office adds some.</p>
      ) : (
        <ul class="tasks">
          {tasks.map((t) => (
            <TaskCard
              key={t.key}
              task={t}
              onEdit={() => {
                setEditing(t);
              }}
            />
          ))}
        </ul>
      )}
      <button
        type="button"
        class="btn2"
        onClick={() => {
          setAdding(true);
        }}
      >
        Add my own task
      </button>
      <p class="hint">Saved on this phone only. Status and notes save as you type.</p>
      <p class="share-status" role="status">
        {outcome === 'failed'
          ? "This phone couldn't make the picture."
          : outcome && SHARE_STATUS[outcome]}
      </p>
      <ToastBar />

      {adding && (
        <TitleDialog
          title="Add my own task"
          initial=""
          confirm="Add task"
          onSave={(value) => actions.addOwnTask(value)}
          onClose={() => {
            setAdding(false);
          }}
        />
      )}
      {editing && editing.progress_id && (
        <TitleDialog
          title="Rename task"
          initial={editing.title}
          confirm="Save"
          onSave={(value) => actions.renameOwnTask(editing.progress_id ?? '', value)}
          onDelete={() => {
            setDeleting(editing);
            setEditing(null);
          }}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="Delete this task?"
          body={<p>{deleting.title}, with its status and notes.</p>}
          confirm="Delete task"
          cancel="Keep it"
          onConfirm={() => {
            const id = deleting.progress_id;
            setDeleting(null);
            if (id) void actions.deleteOwnTask(id);
          }}
          onCancel={() => {
            setDeleting(null);
          }}
        />
      )}
    </Page>
  );
}
