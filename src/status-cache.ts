/**
 * A short per-site memory of the dashboard's slow-changing GitHub reads
 * (the Notion secret, `_config.yml`, the sync workflow's state), so a page
 * view costs only the run and build reads. Best effort: any KV failure reads
 * as a miss, and the owner's own changes (a save, a manual update, a Notion
 * reconnect) forget the entry so the next view reads GitHub again.
 */

import { isNotionUrl } from './notion-url';

export interface SiteFacts {
  readonly notionConnected: boolean;
  /** Catalog name of the theme in `_config.yml`; null when it names none. */
  readonly themeName: string | null;
  /** `inkdrafts.notion_page`, already validated. */
  readonly notionPage: string | null;
}

export const SITE_FACTS_TTL_SECONDS = 5 * 60;
const SITE_FACTS_KEY_PREFIX = 'status:site-facts:';

function siteFactsKey(repositoryId: number): string {
  return `${SITE_FACTS_KEY_PREFIX}${repositoryId}`;
}

export async function readSiteFacts(kv: KVNamespace, repositoryId: number): Promise<SiteFacts | null> {
  let value: unknown;
  try {
    value = await kv.get(siteFactsKey(repositoryId), 'json');
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || typeof record.notionConnected !== 'boolean') return null;
  return {
    notionConnected: record.notionConnected,
    themeName: typeof record.themeName === 'string' ? record.themeName : null,
    notionPage: isNotionUrl(record.notionPage) ? record.notionPage : null,
  };
}

export async function rememberSiteFacts(kv: KVNamespace, repositoryId: number, facts: SiteFacts): Promise<void> {
  try {
    await kv.put(siteFactsKey(repositoryId), JSON.stringify({ v: 1, ...facts }), { expirationTtl: SITE_FACTS_TTL_SECONDS });
  } catch {
    // A missed write only costs the next view its three reads.
  }
}

export async function forgetSiteFacts(kv: KVNamespace, repositoryId: number): Promise<void> {
  try {
    await kv.delete(siteFactsKey(repositoryId));
  } catch {
    // The entry expires on its own within SITE_FACTS_TTL_SECONDS.
  }
}
