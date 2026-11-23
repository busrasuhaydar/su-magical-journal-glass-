// Bildirim merkezi: hatırlatıcılar, yayın sonuçları. Realtime ile anında güncellenir.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '../lib/data';
import { supabase } from '../lib/supabase';
import { dayKeyOf, formatRelative, hhmm, minutesOf } from '../lib/dates';

export function NotificationBell() {
  const q = useNotifications();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = q.data ?? [];
  const unread = list.filter((n) => !n.read_at).length;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [open]);
  useEffect(() => { document.title = unread ? `(${unread}) Su's Magical Journal` : "Su's Magical Journal"; }, [unread]);
  async function markAll() {
    const ids = list.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }
  async function openItem(id: string, url: string | null) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
    qc.invalidateQueries({ queryKey: ['notifications'] });
    setOpen(false);
    if (url) nav(url);
  }
  return (
    <div className="bell-wrap" ref={ref}>
      <button type="button" className="bell glass" onClick={() => setOpen(!open)} aria-label={`Bildirimler${unread ? `, ${unread} okunmamış` : ''}`} aria-expanded={open}>
        <Bell size={18} />{unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Bildirimler">
          <div className="row" style={{ justifyContent: 'space-between', padding: '4px 4px 8px' }}>
            <b>Bildirimler</b>
            {unread > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={markAll}><CheckCheck size={13} />Tümünü okundu say</button>}
          </div>
          {list.length === 0 ? <p className="small muted" style={{ padding: 8 }}>Henüz bildirim yok. Hatırlatıcılar ve yayın sonuçları burada görünür.</p> : (
            <div className="bell-list">
              {list.map((n) => (
                <button type="button" key={n.id} className={`bell-item${n.read_at ? '' : ' unread'}`} onClick={() => openItem(n.id, n.url)}>
                  <span className={`bell-kind k-${n.kind}`} />
                  <span style={{ minWidth: 0 }}>
                    <b>{n.title}</b>
                    {n.body && <span className="small muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>{n.body}</span>}
                    <span className="small muted">{formatRelative(dayKeyOf(n.created_at))} · {hhmm(minutesOf(n.created_at))}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
