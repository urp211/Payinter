/** Ensures apple-touch / shortcut icon links exist in the document head. */
export async function appIconSvgInliner(): Promise<void> {
  if (document.querySelector('link[rel="apple-touch-icon"]')) return;
  for (const rel of ['apple-touch-icon']) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = '/icons/icon-192.png';
    document.head.appendChild(link);
  }
}
