/**
 * The Notion names and promises the owner reads in InkDrafts copy (landing,
 * setup, dashboard). They follow the Notion template that is public, picked
 * by `NOTION_TEMPLATE_SCHEMA_VERSION`, so release step 4 in
 * `docs/notion-template.md` switches every sentence at once. A leaf module:
 * page modules import it at load time.
 */

/**
 * Bumped with the template build sheet when a required property changes.
 * Stays 1 while the public template is v1: the v2 build sheet in
 * docs/notion-template.md goes public only after notiongit-sync 2.1.0 is
 * pinned by the site template, and this moves to 2 in that same change.
 * Validation below already accepts both v1 and v2 copies.
 */
export const NOTION_TEMPLATE_SCHEMA_VERSION: number = 1;

export interface NotionWords {
  /** The owner's top Notion page, as the template names it. */
  readonly root: string;
  readonly posts: string;
  readonly pages: string;
  /** The posts column that holds the date shown on a post. */
  readonly date: string;
  /** The Pages row whose fields fill the home page. */
  readonly home: string;
  readonly about: string;
  readonly samplePost: string;
  /** Photos dragged into Notion are copied to the site (notiongit-sync 2.1.0). */
  readonly uploadsKept: boolean;
}

const V1: NotionWords = {
  root: 'InkDrafts starter site',
  posts: 'Posts',
  pages: 'Pages',
  date: 'Publish Date',
  home: 'Welcome',
  about: 'About this site',
  samplePost: 'Welcome to InkDrafts',
  uploadsKept: false,
};

export const NOTION_WORDS_V2: NotionWords = {
  root: 'My website',
  posts: 'Your posts',
  pages: 'Your pages',
  date: 'Date',
  home: 'Home',
  about: 'About me',
  samplePost: 'Welcome to your new website',
  uploadsKept: true,
};

export const NOTION_WORDS: NotionWords = NOTION_TEMPLATE_SCHEMA_VERSION >= 2 ? NOTION_WORDS_V2 : V1;

/** How long a Notion edit takes to reach the site: the sync runs about every
 * 10 minutes and the site build follows. Every surface quotes this. */
export const UPDATE_WAIT = 'usually within 20 minutes';
/** Largest file the sync copies from Notion (notiongit-sync MAX_FILE_BYTES). */
export const UPLOAD_LIMIT = '20 MB';
