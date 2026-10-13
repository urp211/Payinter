import React, { useEffect, useState } from 'react';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead, apiMutate } from '../api/client';
import type { NotificationItem } from '../lib/models';
import { PageHead, Card, longDate } from '../ui/ui';

export function NotificationsScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const uid = profile?.id ?? 'anon';
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [fromCache, setFromCache] = useState(false);

  const load = () => apiRead<{ items: NotificationItem[]; unreadCount: number }>('/v1/notifications?limit=40', { userId: uid, cacheName: 'notifications', live: conn.live })
    .then((r) => { setItems(r.data.items); setUnread(r.data.unreadCount ?? 0); setFromCache(r.fromCache); })
    .catch(() => undefined);
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [uid, conn.live]);

  const markAll = async () => {
    try {
      await apiMutate('/v1/notifications/read-all', {}, {
        userId: uid, live: conn.live,
        queue: { label: 'Mark notifications read' }
      });
      await load();
    } catch { /* noop */ }
  };

  return (
    <>
      <PageHead title="Notifications" sub={fromCache ? 'Offline snapshot' : unread ? `${unread} unread` : 'All caught up'}
        right={unread > 0 ? <button className="btn ghost small" onClick={markAll}>Mark all read</button> : null} />
      <Card tight>
        <div className="list">
          {items.map((n) => {
            const when = n.createdAt ?? n.created_at;
            const isRead = !!(n.read_at ?? n.read);
            return (
              <div className="item" key={n.id} style={{ opacity: isRead ? 0.62 : 1 }}>
                <div className="ico">{n.type === 'money_received' ? '💰' : n.type === 'security' ? '🔐' : n.type === 'kyc' ? '🪪' : n.type === 'refund' ? '🔁' : n.type === 'support' ? '🎧' : n.type === 'review' ? '👀' : '🔔'}</div>
                <div className="grow">
                  <div className="t1">{n.title}</div>
                  <div className="t2" style={{ whiteSpace: 'normal' }}>{n.body}</div>
                  <div className="t2 tiny">{longDate(when)}</div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && <div className="empty col"><div className="big">🔕</div>No notifications yet.</div>}
        </div>
      </Card>
    </>
  );
}
