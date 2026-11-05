/** Only links that point at Notion are written or rendered, whatever stored
 * them: a cookie, the job record, or a public `_config.yml` anyone can edit. */
export function isNotionUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname;
  return url.protocol === 'https:' && url.username === '' && url.password === '' && url.port === '' && (
    host === 'notion.so' || host === 'www.notion.so' || host === 'app.notion.com' ||
    host === 'notion.site' || host.endsWith('.notion.site')
  );
}
