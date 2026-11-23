import { Link } from 'react-router-dom';
import { Check, Repeat, CalendarClock, X, ArrowRight } from 'lucide-react';
import { useCompleteTask, usePostponeTask, useSaveTask, useProjects, useTasks } from '../lib/data';
import { addDays, dayKeyOf, formatRelative, hhmm, minutesOf, todayKey, toInstant } from '../lib/dates';
import { PRIORITY_LABEL, type Task } from '../lib/types';
import { useEditors } from './Editors';
import { useToast } from './ui';

export function TaskRow({ task, overdue }: { task: Task; overdue?: boolean }) {
  const { openTask } = useEditors();
  const complete = useCompleteTask();
  const postpone = usePostponeTask();
  const save = useSaveTask();
  const toast = useToast();
  const projects = useProjects();
  const project = projects.data?.find((p) => p.id === task.project_id);
  const all = useTasks();
  const subs = (all.data ?? []).filter((t) => t.parent_task_id === task.id && t.status !== 'cancelled');
  const done = task.status === 'done';
  const day = task.starts_at ? dayKeyOf(task.starts_at) : task.due_date;

  /** Gecikmiş görevi aynı saatle başka bir güne taşır. */
  async function moveTo(target: string) {
    const s = task.starts_at ? minutesOf(task.starts_at) : null;
    const e = task.ends_at ? minutesOf(task.ends_at) : null;
    try {
      await postpone.mutateAsync({
        id: task.id, due_date: target,
        starts_at: s != null ? toInstant(target, s) : null,
        ends_at: s != null ? toInstant(target, e != null && e > s ? e : s + 60) : null,
      });
      toast.ok(`Görev ${formatRelative(target).toLocaleLowerCase('tr')} tarihine taşındı`);
    } catch (x) { toast.fail(x); }
  }

  return (
    <div className={`task-row${done ? ' done' : ''}${overdue ? ' overdue' : ''}`} onClick={() => openTask(task)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openTask(task)}>
      <button type="button" className={`check${done ? ' on' : ''}`} aria-label={done ? 'Tamamlanmadı olarak işaretle' : 'Tamamla'}
        onClick={async (e) => { e.stopPropagation(); try { await complete.mutateAsync({ id: task.id, done: !done }); if (!done) toast.ok(task.rrule ? 'Tamamlandı, bir sonraki tekrar eklendi' : 'Tamamlandı'); } catch (x) { toast.fail(x); } }}>
        {done && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="t">
        <b>{task.title}</b>
        <div className="meta">
          <span className="row" style={{ gap: 4 }}><i className={`dot p-${task.priority}`} />{PRIORITY_LABEL[task.priority]}</span>
          {day && <span>{formatRelative(day)}{task.starts_at ? ` · ${hhmm(minutesOf(task.starts_at))}` : ''}</span>}
          {project && <Link className="chip" to={`/projeler/${project.slug}`} onClick={(e) => e.stopPropagation()} style={{ padding: '1px 8px', textDecoration: 'none' }}><i className="dot" style={{ background: project.color }} />{project.title}</Link>}
          {task.category && <span>{task.category}</span>}
          {subs.length > 0 && <span>✓ {subs.filter((s) => s.status === 'done').length}/{subs.length} alt görev</span>}
          {task.rrule && <Repeat size={12} aria-label="Tekrarlanan" />}
          {task.postpone_count > 0 && <span title="Erteleme sayısı">↻ {task.postpone_count} kez ertelendi</span>}
        </div>
        {overdue && (
          <div className="acts" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => moveTo(todayKey())}><ArrowRight size={13} />Bugüne al</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => moveTo(addDays(todayKey(), 1))}><CalendarClock size={13} />Yarına ertele</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openTask(task)}>Yeniden planla</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { try { await save.mutateAsync({ id: task.id, title: task.title, status: 'cancelled' }); toast.ok('Görev iptal edildi'); } catch (x) { toast.fail(x); } }}><X size={13} />İptal et</button>
          </div>
        )}
      </div>
    </div>
  );
}
