import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NOTION_WORDS_V2 } from '../src/notion-words';

const BUILD_SHEET = readFileSync(join(import.meta.dir, '..', 'docs', 'notion-template.md'), 'utf8');

describe('Notion words', () => {
  test('the version 2 names the copy switches to are the ones the build sheet creates', () => {
    for (const name of [NOTION_WORDS_V2.root, NOTION_WORDS_V2.posts, NOTION_WORDS_V2.pages, NOTION_WORDS_V2.home, NOTION_WORDS_V2.about, NOTION_WORDS_V2.samplePost]) {
      expect(BUILD_SHEET).toContain(name);
    }
    expect(BUILD_SHEET).toContain(`\`${NOTION_WORDS_V2.date}\``);
    expect(BUILD_SHEET).toContain('usually within 20 minutes');
  });

  test('no page promises its own update wait', () => {
    const src = join(import.meta.dir, '..', 'src');
    for (const file of readdirSync(src).filter((name) => name.endsWith('.ts') && !name.endsWith('.generated.ts'))) {
      const text = readFileSync(join(src, file), 'utf8');
      expect(`${file}: ${text.match(/(?:within|about|every) (?:about )?1[05] minutes/iu)?.[0] ?? ''}`).toBe(`${file}: `);
    }
  });
});
