/**
 * Public progress projection over a durable provisioning job.
 *
 * The KV job record is the sole source of truth for progress; this module is
 * the only place job state becomes browser-facing copy. Leak safety is
 * structural: every string in the projection is a registry label or headline,
 * verbatim taxonomy copy, the fixed wait sentence, or one of the allowlisted
 * repository/site identity fields the flow already exposes. Nothing else from
 * the record — installation id, identity, lock, provider breadcrumbs — has a
 * path into the output.
 */

import {
  nextPendingStep,
  PROVISIONING_STEP_ORDER,
  type AppearanceSkipReason,
  type ProvisioningJob,
  type ProvisioningStepName,
} from './provisioning-job';
import { FAILURE_REGISTRY, userCopy } from './failures';
import { findTheme } from './theme-catalog';

export const PROGRESS_STAGE_ORDER = [
  'github_connected', 'repository_created', 'notion_connected',
  'settings_prepared', 'publishing_enabled', 'content_synced', 'site_published',
] as const;

export type ProgressStageId = (typeof PROGRESS_STAGE_ORDER)[number];

export interface ProgressStageEntry {
  readonly label: string;
  readonly headline: string;
}

export const PROGRESS_STAGE_REGISTRY: { [S in ProgressStageId]: ProgressStageEntry } = {
  github_connected: { label: 'Connect GitHub', headline: 'Connecting your GitHub account.' },
  repository_created: { label: 'Make a home for your site', headline: 'Making a home for your site on GitHub.' },
  notion_connected: { label: 'Connect Notion', headline: 'It takes about a minute. The rest runs by itself.' },
  settings_prepared: { label: 'Set up your site', headline: 'Setting up your site.' },
  publishing_enabled: { label: 'Turn on your website', headline: 'Turning on your website.' },
  content_synced: { label: 'Copy your Notion pages', headline: 'Copying your Notion pages.' },
  site_published: { label: 'Put your site online', headline: 'Putting your site online.' },
};

/** Machine step to public stage. A new step fails typecheck until it declares
 * its human stage here, so the checklist can never miss one. */
export const STAGE_BY_STEP: { [S in ProvisioningStepName]: ProgressStageId } = {
  verify_repository: 'settings_prepared',
  patch_config: 'settings_prepared',
  configure_pages: 'publishing_enabled',
  dispatch_sync: 'content_synced',
  await_sync: 'content_synced',
  await_deploy_build: 'site_published',
  verify_deploy: 'site_published',
};

/** `your_turn`: the setup waits on the owner (the Notion consent), not on
 * InkDrafts, so it must not look busy. */
export type ProgressStageState = 'done' | 'current' | 'your_turn' | 'pending' | 'blocked';

export interface ProgressStageView {
  readonly id: ProgressStageId;
  readonly label: string;
  readonly state: ProgressStageState;
}

export type PublicProgress =
  | { readonly status: 'awaiting_notion'; readonly stages: readonly ProgressStageView[];
      /** The owner already writes in Notion: share that page, not a new copy. */
      readonly reconnect: boolean }
  | { readonly status: 'active'; readonly stages: readonly ProgressStageView[];
      readonly notice: { readonly message: string; readonly action: string } | null;
      readonly pollAfterSeconds: number | null }
  | { readonly status: 'succeeded'; readonly stages: readonly ProgressStageView[];
      readonly repository: { readonly name: string; readonly url: string };
      readonly site: { readonly url: string };
      readonly notionLinks: {
        readonly pagesUrl: string | null;
        readonly postsUrl: string | null;
        readonly templateRootUrl: string | null;
      };
      /** One sentence about the chosen theme; null when none was chosen. */
      readonly appearanceNote: string | null }
  | { readonly status: 'failed'; readonly stages: readonly ProgressStageView[];
      readonly message: string; readonly action: string;
      readonly restartUrl: string | null;
      /** True when the failure is ours to retry from where it stopped. */
      readonly canRetry: boolean }
  | { readonly status: 'missing'; readonly message: string; readonly action: string;
      readonly restartUrl: string };

export interface ProgressSnapshot {
  /** `job.updatedAt`; 0 when missing. The client's monotonic guard against
   * stale KV reads. */
  readonly updatedAt: number;
  readonly progress: PublicProgress;
}

/** A wait is a stall the queue resolves on its own, never a failure, so it
 * gets its own sentence instead of taxonomy copy. */
const WAIT_NOTICE: { readonly message: string; readonly action: string } = {
  message: 'You are in line. Many sites are being set up right now.',
  action: 'It continues by itself. No need to do anything.',
};

const MISSING_COPY = {
  message: 'This setup link has expired.',
  action: 'If your site is already set up, manage it from your dashboard. If not, start again from the beginning.',
};
const RESTART_URL = '/connect';
const TERMINAL_RETRY_ACTION = 'We tried several times and stopped. Press Try again to pick up where it stopped.';
const LAST_STEP = PROVISIONING_STEP_ORDER[PROVISIONING_STEP_ORDER.length - 1];

/** Stand-in for a job resolved before canonical-URL capture existed: every
 * Notion link renders as its linkless fallback copy. */
const NULL_NOTION_LINKS: Extract<PublicProgress, { status: 'succeeded' }>['notionLinks'] = {
  pagesUrl: null,
  postsUrl: null,
  templateRootUrl: null,
};

/** `theme_unavailable` covers older reused repositories that cannot switch
 * themes at all, so that note promises no later switch. */
export const APPEARANCE_SKIPPED_NOTES = {
  theme_unavailable: 'The theme you picked is not in this site’s repository, so your site keeps its current look.',
  theme_invalid: 'Your site uses the default design; change it any time from your dashboard.',
} as const satisfies Record<AppearanceSkipReason, string>;

/** Catalog names only: a stored id that left the catalog reads as invalid. */
function appearanceNoteOf(job: ProvisioningJob): string | null {
  if (!job.data.appearance) return null;
  const theme = findTheme(job.data.appearance.themeId);
  if (job.data.appearanceSkipped !== null) return APPEARANCE_SKIPPED_NOTES[job.data.appearanceSkipped];
  if (!theme) return APPEARANCE_SKIPPED_NOTES.theme_invalid;
  return `Design: ${theme.name}`;
}

export function progressPageUrl(jobId: string): string {
  return `/progress?job_id=${encodeURIComponent(jobId)}`;
}

function stageIndex(id: ProgressStageId): number {
  return PROGRESS_STAGE_ORDER.indexOf(id);
}

function stageViewsAt(currentIndex: number, current: 'current' | 'blocked' | 'your_turn' = 'current'): ProgressStageView[] {
  return PROGRESS_STAGE_ORDER.map((id, index) => ({
    id,
    label: PROGRESS_STAGE_REGISTRY[id].label,
    state: index < currentIndex ? 'done' : index === currentIndex ? current : 'pending',
  }));
}

function stageViews(currentStageId: ProgressStageId, current: 'current' | 'blocked' | 'your_turn' = 'current'): ProgressStageView[] {
  return stageViewsAt(stageIndex(currentStageId), current);
}

function failedStepOf(job: ProvisioningJob): ProvisioningStepName | null {
  return PROVISIONING_STEP_ORDER.find((step) => job.steps[step].status === 'failed') ?? null;
}

export function projectProvisioning(job: ProvisioningJob | null, now: number): ProgressSnapshot {
  if (!job) {
    return {
      updatedAt: 0,
      progress: {
        status: 'missing',
        message: MISSING_COPY.message,
        action: MISSING_COPY.action,
        restartUrl: RESTART_URL,
      },
    };
  }

  if (job.status === 'succeeded') {
    return {
      updatedAt: job.updatedAt,
      progress: {
        status: 'succeeded',
        stages: stageViewsAt(PROGRESS_STAGE_ORDER.length),
        repository: { name: job.data.generatedRepository.name, url: job.data.generatedRepository.htmlUrl },
        site: { url: job.data.repository.url },
        notionLinks: job.data.notionLinks ?? NULL_NOTION_LINKS,
        appearanceNote: appearanceNoteOf(job),
      },
    };
  }

  if (job.status === 'failed' || job.status === 'dead_letter') {
    // Both dead-lettering and the supersession gate write status 'failed' on
    // the step, so the step search is the one lookup; the fallback code keeps
    // the projection total for a record that predates its own failure.
    const step = failedStepOf(job) ?? nextPendingStep(job) ?? LAST_STEP;
    const code = job.steps[step].lastError?.code ?? 'provisioning_step_failed';
    const copy = userCopy(code);
    return {
      updatedAt: job.updatedAt,
      progress: {
        status: 'failed',
        stages: stageViews(STAGE_BY_STEP[step], 'blocked'),
        message: copy.message,
        // A retryable code reached here only after its attempts ran out, so
        // its "we'll keep trying" copy is no longer true.
        action: FAILURE_REGISTRY[code].retryable ? TERMINAL_RETRY_ACTION : copy.action,
        restartUrl: FAILURE_REGISTRY[code].recovery === 'restart_flow' ? RESTART_URL : null,
        canRetry: FAILURE_REGISTRY[code].recovery !== 'contact_support',
      },
    };
  }

  if (job.status === 'awaiting_notion') {
    // The secrets timestamp, not the status, says whether the Notion stage is
    // finished: a stale read may still show it as current, but a written job
    // never shows it as pending.
    const written = Boolean(job.data.notionSecretsWrittenAt);
    return {
      updatedAt: job.updatedAt,
      progress: {
        status: 'awaiting_notion',
        stages: written ? stageViews('settings_prepared') : stageViews('notion_connected', 'your_turn'),
        reconnect: job.data.notionMode === 'reconnect',
      },
    };
  }

  // queued, running, and paused are live states: the job is advancing or
  // parked on a wait the queue resolves by itself.
  const step = nextPendingStep(job) ?? LAST_STEP;
  const stepError = job.steps[step].lastError;
  const notice = stepError ? userCopy(stepError.code) : job.wait ? WAIT_NOTICE : null;
  const pollAfterSeconds = job.wait?.untilMs == null
    ? null
    : Math.max(1, Math.ceil((job.wait.untilMs - now) / 1000));
  return {
    updatedAt: job.updatedAt,
    progress: {
      status: 'active',
      stages: stageViews(STAGE_BY_STEP[step]),
      notice,
      pollAfterSeconds,
    },
  };
}
