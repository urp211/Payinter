import { Router } from 'express';
import path from 'path';
import fs from 'fs';

export const legalRouter = Router();

const DOCS = [
  { id: 'sandbox-notice', title: 'Sandbox Notice', file: 'sandbox-notice.md' },
  { id: 'regulatory-disclaimer', title: 'Regulatory & Licensing Disclaimer', file: 'regulatory-disclaimer.md' },
  { id: 'terms', title: 'Terms of Service (demo)', file: 'terms.md' },
  { id: 'privacy', title: 'Privacy Notice (demo)', file: 'privacy.md' }
];

function legalDir(): string {
  return path.resolve(process.cwd(), '..', 'docs', 'legal');
}

legalRouter.get('/', async (_req, res) => {
  const items = DOCS.map((d) => {
    const p = path.join(legalDir(), d.file);
    let updatedAt: string | null = null;
    try { updatedAt = fs.statSync(p).mtime.toISOString(); } catch { /* missing file */ }
    return { id: d.id, title: d.title, available: updatedAt !== null, updatedAt };
  });
  res.json({ items });
});

legalRouter.get('/:id', async (req, res) => {
  const doc = DOCS.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
  let body = '';
  try { body = fs.readFileSync(path.join(legalDir(), doc.file), 'utf8'); }
  catch { body = `# ${doc.title}\n\nDocument not provisioned in this environment.`; }
  res.json({ id: doc.id, title: doc.title, markdown: body });
});
