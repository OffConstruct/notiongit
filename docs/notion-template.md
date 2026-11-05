# InkDrafts Notion template

This is the build sheet for the single public Notion template that the
InkDrafts connection duplicates into each owner's workspace. It has no
workspace IDs, private content or credentials. Build the page in a disposable
workspace first, check it with [Before you publish it](#before-you-publish-it),
then make that page public and set it as the connection's template.

The page is built by hand: nothing in this repository generates it. A change
to this sheet reaches owners only after someone rebuilds and republishes the
public page.

This sheet describes **template version 2**. Version 1 (the "InkDrafts
starter site" page with `Slug`, `Nav Order`, `Show in Nav`, `Publish Date`
and the `home` / `blog-list` / `blog` / `markdown` Type values) stays
supported: owners keep the copy they duplicated, and validation and the sync
accept both versions. See [Release order](#release-order) before publishing
version 2.

## Who reads this page

The owner is not technical. They don't know what GitHub, a repository, a
deploy or a slug is, and they should never need to. Every word on the page
follows three rules:

- Say what to do in Notion, in Notion's own words (page, list, column,
  Status, Published, drag, click New).
- Promise only what the sync engine really does (see
  [What the copy promises](#what-the-copy-promises)).
- Never put guidance in the body of a row that is Published, because the
  body of a Published row appears on the live site. The one exception is the
  example post, which is published on purpose to prove that the site works.

The same model is taught here and on the dashboard
(`inkdrafts.com/status`): **write in Notion, set Status to Published, and
your site updates by itself, usually within 20 minutes.**

## Root page

Title: **My website**. Icon: a house.

The two database blocks must be inline databases that are children of this
page (not linked views of databases elsewhere). The provisioning walk starts
at the duplicated root page and recognizes the databases by their columns,
not their titles, so owners may rename either list. Keep exactly one Pages
database and one Posts database under this page.

Add these blocks in this order.

### 1. Callout

Blue background, info icon. Three lines:

> **This page is your website.** Write here in Notion. Your site updates by
> itself, usually within 20 minutes.
>
> Nothing is public until you set its **Status** to **Published**.
>
> Your site's address, its design and an **Update my site now** button are on
> your dashboard: [inkdrafts.com/status](https://inkdrafts.com/status)

The page links to the dashboard, not to the site. The template is duplicated
before the site exists, and the connection only reads from Notion, so it
can't write the site's address into the page.

### 2. Heading 2: **Write something**

A paragraph:

> To write a post, click **New** under *Your posts*. To add a page, like
> About or Contact, click **New** under *Your pages*. Each one starts as a
> Draft, so nobody sees it until you're ready.

### 3. Inline database: **Your posts**

The Posts database (see [Posts database](#posts-database)). Default view
**Newest first**: table, sorted by Date, descending, showing Title, Status,
Date and Tags. The other columns show when a post is opened.

### 4. Inline database: **Your pages**

The Pages database (see [Pages database](#pages-database)). Default view
**Menu order**: table, sorted by Menu order, ascending, showing Title,
Status, Type and Show in menu.

### 5. Heading 2: **How do I…**

Eight toggle blocks. The first one starts open. Exact text:

**Write and publish a new post**

1. Click **New** under *Your posts*. Type a title, then write below it like
   any Notion page.
2. When you're happy with it, set **Status** to **Published**.
3. It appears on your site within about 20 minutes. There's no other step.

**Fix a typo or change something already published**

Just edit it and leave Status on Published. The fix shows on your site
within about 20 minutes. The post keeps the same web address, even if you
change its title.

Don't switch it to Draft while you edit: Draft takes it off your site.

**Add a photo**

Drag a photo from your computer into the page, or paste it. InkDrafts copies
it to your site, so it keeps working. Photos and files can be up to 20 MB
each.

For a post's cover picture, drop a photo into its **Cover image** column.

**Hide or remove something**

Set **Status** to **Draft**. It leaves your site at the next update. Your
writing stays here in Notion, and you can publish it again any time.

Deleting it in Notion removes it from your site too. Removing the example
post is fine. If you take many things off at once, your dashboard asks you
to confirm first.

**Post something later**

Set **Status** to **Published** and pick a future **Date**. It appears on
your site on that day.

**Add a page to the menu (About, Contact, Projects…)**

1. Click **New** under *Your pages* and give it a title.
2. Tick **Show in menu**. **Menu order** sets the order: smaller numbers
   come first.
3. Set **Status** to **Published**.

**Change my name, photo or the line under my name**

Open **Home** in *Your pages*. **Name** is the name at the top of every page
and in the browser tab. **Tagline** is the line under it, also shown when
someone shares your site. Drop a picture of yourself into **Photo**. **Links**
holds your email and social links, one per line. What you write inside Home
is your welcome text.

Colours, fonts and the overall look are on your dashboard, under **Change
appearance**.

**My change isn't showing**

1. Is **Status** set to **Published**? Drafts never show.
2. Has it been 20 minutes? Updates run by themselves every few minutes, and
   sometimes run late.
3. Is the **Date** in the future? Then it waits for that day.
4. Open your dashboard at inkdrafts.com/status. It shows when your site last
   updated, names anything it couldn't publish and why, and has an **Update
   my site now** button.

### 6. Divider, then a small gray paragraph

> You can rename this page and the two lists, move things around, and add
> your own columns. Please keep the existing columns as they are: your site
> reads them.

## Pages database

Database title: **Your pages**. One row is one page of the site.

Create these columns with these exact names and types, in this order. Set
each description as the column's Notion description (it shows when someone
hovers over the column name).

| Column | Notion type | Options | Description | Default view |
| --- | --- | --- | --- | --- |
| `Title` | Title | — | The page's name. Also its label in the menu. | shown |
| `Status` | Select | `Draft`, `Published` | Draft: only you can see it. Published: it's on your site. | shown |
| `Type` | Select | `Home page`, `Regular page`, `List of posts` | Home page: your front page (keep just one). Regular page: any page you write, like About. List of posts: a page that lists your posts. | shown |
| `Show in menu` | Checkbox | — | Tick to put the page in your site's top menu. | shown |
| `Menu order` | Number | Number format | Order in the menu. Smaller numbers come first. Leave gaps (10, 20, 30) so you can slot pages in between. | hidden |
| `Name` | Text | — | Home row only. Your name, shown at the top of every page. | hidden |
| `Tagline` | Text | — | The line under your name, also used when someone shares your site. | hidden |
| `Photo` | Files & media | — | Home row only. Drop a photo of yourself here. | hidden |
| `Links` | Text | — | Home row only. One per line: a name, a colon, then the link. For example `Email: mailto:you@example.com` or `ORCID: https://orcid.org/0000-0000-0000-0000`. Delete the ones you don't use. | hidden |
| `Summary` | Text | — | Optional. One sentence that search engines and link previews show. | hidden |
| `Web address` | Text | — | Optional. Leave it empty and InkDrafts makes one from the title. It stays the same if you later fix the title. | hidden |

In each row's page view, set `Web address` and `Summary` to *Hide when
empty*. On the Home row, the profile columns (`Name`, `Tagline`, `Photo`,
`Links`) stay visible.

### Rows

| Title | Status | Type | Show in menu | Menu order | Web address | Other columns | Body |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home | Published | Home page | No | 0 | `home` | Name `Your name`; Tagline `One line about you`; Links `Email: mailto:you@example.com` and `Instagram: https://instagram.com/yourname` on two lines; Photo empty | One paragraph: "Write a few lines about yourself here. They appear on your home page." |
| About me | Draft | Regular page | Yes | 10 | `about` | — | One paragraph: "Tell visitors who you are and how to reach you. Set Status to Published when it's ready." |
| Writing | Published | List of posts | Yes | 20 | `blog` | — | Empty |

The Home row's placeholders ("Your name", "One line about you") appear on
the live site until the owner changes them. That is deliberate: the first
visit to the site is itself the reminder to fill them in. Use only
`example.com`-style sample addresses; never a real person's profile, social
account or email.

### Database template: **New page**

Set it as the database's default template, so **New** uses it.

- Status: Draft
- Type: Regular page
- Show in menu: ticked
- Menu order: 50
- Body: one gray paragraph, "Write your page here."

## Posts database

Database title: **Your posts**. One row is one post.

| Column | Notion type | Options | Description | Default view |
| --- | --- | --- | --- | --- |
| `Title` | Title | — | The headline of your post. | shown |
| `Status` | Select | `Draft`, `Published` | Draft: only you can see it. Published: it's on your site. | shown |
| `Date` | Date | — | The date shown on the post. A future date waits until that day. | shown |
| `Tags` | Multi-select | `hello` | Optional topics, like "travel". Readers can browse posts by tag. Some designs give a tag a special place: Halo lists posts tagged `live` as your upcoming dates. | shown |
| `Summary` | Text | — | Optional. One or two sentences shown in lists and when someone shares the link. | hidden |
| `Cover image` | Files & media | — | Optional. Drop a photo here. Some designs show it at the top of the post and in lists. | hidden |
| `Featured` | Checkbox | — | Optional. Tick to give the post a highlighted spot, in designs that have one. | hidden |
| `Web address` | Text | — | Optional. Leave it empty and InkDrafts makes one from the title. It stays the same if you later fix the title. | hidden |
| `Originally published at` | URL | — | Optional. Only if this post first appeared on another website: paste that link here. | hidden |

In each row's page view, set `Web address` and `Originally published at` to
*Hide when empty*.

### Rows

**Welcome to your new website**

- Status: Published
- Date: the day you build the template
- Tags: `hello`
- Summary: "An example post. Change it or delete it."
- Web address: `welcome-to-inkdrafts`. Keep exactly this value. The sync
  lets an owner delete the example post without a confirmation by matching
  this address.
- Cover image: a photo **uploaded** to Notion (not a link), so every new
  site proves on its first update that uploaded photos work.
- Body, in this order:
  1. Paragraph: "This is an example post, so your site isn't empty on day
     one. It's already on your site. Try changing it and watch your site
     follow."
  2. Heading 3: "Try these three things"
  3. Numbered list:
     1. "Change the title above to anything you like. Your site shows the
        new title within about 20 minutes, at the same web address."
     2. "Add a photo: drag one from your computer just below this list."
     3. "Hide this post: set Status to Draft. It leaves your site; it stays
        here."
  4. An image uploaded to Notion, with the caption "A photo dragged straight
     in. Captions show under the photo on your site."
  5. Quote: "Quotes, lists, headings, toggles, tables and links all show on
     your site the way they look here."
  6. Toggle "A toggle: click to open", containing the paragraph "Readers can
     open and close this on your site too."
  7. Callout: "When your own first post is published, delete this one.
     Nothing breaks: your site just removes it."

**My first real post**

- Status: Draft
- Date: empty
- Body: one gray paragraph, "Start writing here. Drag photos straight in."

### Database template: **New post**

Set it as the database's default template.

- Status: Draft
- Date: **Today** (Notion's dynamic date, filled in when the post is
  created). Post addresses contain the date, so a date set at creation keeps
  the address stable. The sync also falls back to the creation day when the
  Date is empty.
- Body: one gray paragraph, "Start writing here. Drag photos straight in."

## The dashboard's three-line how-to

The dashboard card *Keep your site up to date* repeats the model in the same
words. The text, for `src/status-page.ts`:

1. **Write in Notion.** Click New under Your posts on your Notion page.
2. **Set Status to Published.** Drafts stay private.
3. **Your site updates by itself.** Usually within 20 minutes.

## What the copy promises

Each promise above holds only with notiongit-sync 2.1.0 or later. With an
older pinned version, the promise in the right-hand column is false.

| Promise | Needs |
| --- | --- |
| A photo dragged into Notion keeps working, and Cover image / Photo accept uploads | 2.1.0: files are copied into the site |
| Deleting the example post just works | 2.1.0: the guard lets the `welcome-to-inkdrafts` post go |
| One post with a problem doesn't stop the rest from updating | 2.1.0, plus the site template's commit step that runs after a failed row |
| Fixing a title keeps the web address | 2.1.0: an existing row keeps its address |
| A future Date waits for that day | 2.1.0: future posts are held back until their date |
| Toggles, tables and columns show on the site | 2.1.0: nested blocks are read |
| Type labels Home page / List of posts / Regular page work | 2.1.0: the engine maps them; older versions treat every row as a regular page |
| Tagline is used when someone shares the site | 2.1.0: it becomes the site description |
| A title with a bold word is kept whole | 2.1.0 |

## Schema version

Template version 2 changes these column names. Each old name stays accepted
everywhere, so version 1 copies keep working.

| Version 1 | Version 2 | Database |
| --- | --- | --- |
| `Slug` | `Web address` | both |
| `Nav Order` | `Menu order` | Pages |
| `Show in Nav` | `Show in menu` | Pages |
| `Type` values `home`, `blog-list` (or `blog`), `markdown` | `Home page`, `List of posts`, `Regular page` | Pages |
| `Description` | `Summary` | both |
| `Profile Picture` (Text) | `Photo` (Files & media) | Pages |
| `Social Links` | `Links` | Pages |
| `Publish Date` | `Date` | Posts |
| `Cover Image` | `Cover image` | Posts |
| `Canonical URL` | `Originally published at` | Posts |

The runtime fingerprint that tells the two databases apart is unchanged in
meaning. Each required column is matched through its list of accepted names
(`PAGES_SCHEMA_CONTRACT` / `POSTS_SCHEMA_CONTRACT` in
`src/notion-template.ts`):

- Pages: `Slug` / `Web address` (Text), `Type` (Select), `Nav Order` /
  `Menu order` (Number), `Show in Nav` / `Show in menu` (Checkbox), `Status`
  (Select).
- Posts: `Slug` / `Web address` (Text), `Publish Date` / `Date` (Date),
  `Tags` (Multi-select), `Status` (Select).

The sync engine reads the same name lists (`PAGE_COLUMNS` / `POST_COLUMNS`
in notiongit-sync). Change both together.

`NOTION_TEMPLATE_SCHEMA_VERSION` stays `1` until the version 2 page is
public; it moves to `2` in the same change that switches the template (see
below).

## Onboarding validation

The Notion callback validates both databases before the GitHub connection
can begin. It reads only column names, column types and select choices,
never rows, page content or tokens.

- Every fingerprint column above must exist with the right type.
- `Type` must offer one choice of each kind: a home page (`Home page` or
  `home`), a list of posts (`List of posts`, `blog-list` or `blog`) and a
  regular page (`Regular page` or `markdown`). Version 1 and version 2
  labels may be mixed. Any other choice is rejected.
- Both `Status` selects must contain `Published`, and may contain `Draft`.
- Optional columns may be missing, but are rejected when present with the
  wrong type. `Profile Picture` / `Photo` may be Text or Files & media.

A failure names the list and the column the way the owner's copy names it,
in words they can act on, for example: "In your Pages list, the column Type
needs these choices: Home page, List of posts and Regular page. Then connect
Notion again." It says "column", never "property".

## Before you publish it

Check these in the disposable workspace, on a test site whose sync workflow
already pins notiongit-sync 2.1.0:

1. Duplicate the page through the InkDrafts connection ("Use a template
   provided by the developer"). Provisioning resolves both databases.
2. The first update publishes the Home row, Writing and the example post,
   with its uploaded cover image and photo copied into the site, and the
   toggle opening on the site.
3. **New** in each list creates a row from the default template. In Your
   posts, Date is filled with the day of creation.
4. Set the example post to Draft: it leaves the site at the next update,
   with no confirmation asked.
5. Hover each column name: its description shows.
6. Nothing on the page says GitHub, slug, sync, Jekyll, front matter or
   deploy.

## Release order

The version 2 page promises behavior that only notiongit-sync 2.1.0 has, and
its Type labels would turn the Home row into a regular page under 2.0.x. So:

1. Tag notiongit-sync **v2.1.0** (its Release workflow).
2. Bump the pinned SHA in the site template's
   `.github/workflows/sync-notion.yml` to v2.1.0. That file already commits
   after a failed row and adds `assets/notion`. In the same template commit,
   update its README sections that describe the sync: "What the sync
   changes" (adds `assets/notion/` and the `description` line), "If a run is
   red" (a row that cannot be published no longer turns the run red),
   "Bulk-delete protection" (deletions are held back and everything else is
   committed) and "Images" (drag photos into Notion, up to 20 MB each).
3. Build and check the version 2 page as above, then make it the
   connection's template.
4. In the Worker, set `NOTION_TEMPLATE_SCHEMA_VERSION` to `2`. That one
   change also switches every Notion name and promise the landing page,
   setup pages and dashboard quote (`src/notion-words.ts`: "My website",
   "Your posts", "Date", photo uploads), so they match this page.

Sites created before step 2 keep their old workflow file, and with it the
old pinned sync version, until their workflow file is updated. Deciding how
(a Worker-opened update, which needs the GitHub App's `workflow`
permission, or a documented reconnect) is an open owner decision.
