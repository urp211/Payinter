import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useConnectivity } from '../state/connectivity';
import { apiRead } from '../api/client';
import { PageHead, Card } from '../ui/ui';

const DOCS: Record<string, string> = {
  'sandbox-notice': 'Sandbox & Demo Notice',
  'regulatory-disclaimer': 'Regulatory & Compliance',
  terms: 'Terms of Service',
  privacy: 'Privacy Policy'
};

export function LegalScreen() {
  const { doc = 'terms' } = useParams();
  const conn = useConnectivity();
  const [content, setContent] = useState<{ title: string; markdown: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(null); setError(null);
    void apiRead<{ id: string; title: string; markdown: string }>(`/v1/legal/${doc}`, { userId: 'anon', cacheName: `legal:${doc}`, live: conn.live })
      .then((r) => setContent(r.data))
      .catch((e) => setError(e?.message ?? 'Unavailable offline — open once while connected.'));
  }, [doc, conn.live]);

  return (
    <>
      <PageHead title={DOCS[doc] ?? 'Document'} />
      <div className="crumb">
        {Object.entries(DOCS).map(([id, label]) => (
          <Link key={id} to={`/legal/${id}`}><button className={doc === id ? 'active' : ''}>{label}</button></Link>
        ))}
      </div>
      <Card>
        {error && <div className="banner off">{error}</div>}
        {!content && !error && <div className="spin" />}
        {content && (
          <pre className="tiny" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.65, fontSize: 13.5, margin: 0 }}>
            {content.markdown}
          </pre>
        )}
      </Card>
    </>
  );
}
