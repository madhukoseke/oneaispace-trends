// Phase 3C: the calibration regression suite.
//
// Every case is a pure function call against the stored texts of real records: arXiv papers,
// an OpenAI customer story and release note, a Microsoft Research framework release, GitHub
// repositories, Hacker News posts. The suite reads nothing from the database, calls no model,
// fetches nothing and writes nothing, and it exercises the same modules the live batch and the
// read-only diagnostics use - so a passing case cannot describe logic the live path does not use.
//
// The fixtures keep the exact stored fields of the records they are taken from (title, excerpt,
// format, source key), because those fields are all the calibration is allowed to read.

import { CONTENT_STATES, DEV_ANALYSIS_CONFIG, RELEASE_VERBS } from './devAnalysisConfig.ts';
import {
  familyTokens, numericDesignatorTokens, researchArtifactTokens, versionedTokens,
} from './devAnalysisGrouping.ts';
import { normalizeForMatch } from './modelProofCriteria.ts';
import { cleanExcerpt, stripHtml } from './normalize.ts';
import { buildSourceView, selectAnalysable } from './devAnalysisCriteria.ts';
import { resolveFeed } from './devFeed.ts';
import { createCaseRecorder } from './pipelineSupport.ts';
import {
  CALIBRATION_LIMITATIONS, EVENT_TYPES, calibrateDevelopment, calibrateSourceRecord, classifyEvent,
  evidenceStatusOf, summarizeCalibration,
} from './devCalibration.ts';

function item(overrides) {
  return {
    id: 'itm_sample',
    source: 'arXiv',
    source_key: 'arxiv',
    format: 'research',
    title: 'Example',
    excerpt: '',
    canonical_url: 'https://example.org/sample',
    published_at: '2026-10-08T00:00:00.000Z',
    ...overrides,
  };
}

function quine() {
  return item({
    id: 'itm_quine',
    title: 'Quine: A Self-Compiling Language for Agentic Systems',
    excerpt: 'We propose Quine, a self-compiling language for agentic systems, and evaluate it on three benchmarks.',
    canonical_url: 'https://arxiv.org/abs/2510.00001',
  });
}

function merit() {
  return item({
    id: 'itm_merit',
    title: 'MERIT: A Benchmark for Multi-Step Reasoning',
    excerpt: 'We introduce MERIT, a benchmark for multi-step reasoning, and report results for GPT-6 Luna.',
    canonical_url: 'https://arxiv.org/abs/2510.00002',
  });
}

// Stored as a research record, with an abstract that opens on the problem rather than on the
// contribution - the case the research title pattern exists for.
function dreamtrue() {
  return item({
    id: 'itm_dreamtrue',
    title: 'DreamTrue: Action-Faithful Robot World Model with Counterfactual Post-Training',
    excerpt: 'We present DreamTrue, a multi-view, cross-embodiment robot world model for action-faithful and physically plausible video prediction.',
    canonical_url: 'https://arxiv.org/abs/2610.12468v1',
  });
}

function dexOne2Many() {
  return item({
    id: 'itm_dex',
    title: 'Dex-One2Many: Learning Dexterous Manipulation from a Single Human Demonstration',
    excerpt: 'While learning dexterous manipulation from a single human video offers a promising alternative to costly robot demonstrations, many recent methods predominantly imitate demonstrated motions.',
    canonical_url: 'https://arxiv.org/abs/2610.12470v1',
  });
}

// The same title and text, stored from a news source rather than as a research record.
function dexAsNews() {
  return item({
    ...dexOne2Many(),
    id: 'itm_dex_news',
    source: 'Example News',
    source_key: 'example',
    format: 'article',
    canonical_url: 'https://example.com/dex-one2many',
  });
}

function rubricCepr() {
  return item({
    id: 'itm_rubric',
    title: 'Rubric-CEPR: Self-Evolving Image Editing via Reward-Verified Self-Distillation',
    excerpt: 'Instruction-guided image editors have become highly capable, yet improving them further still depends on human-edited training pairs or external reward models.',
    canonical_url: 'https://arxiv.org/abs/2610.12469v1',
  });
}

// Title present, excerpt missing: the evidence limitation, not a classification failure.
function milleMiglia() {
  return item({
    id: 'itm_mille',
    title: 'MilleMiglia: A realistic instance generator for autonomous driving',
    excerpt: '',
    canonical_url: 'https://arxiv.org/abs/2610.12471v1',
  });
}

function genericSurvey() {
  return item({
    id: 'itm_ecology',
    title: 'The Ecology of AI Agents',
    excerpt: 'This paper surveys the ecology of AI agents and the incentives that shape them.',
    canonical_url: 'https://arxiv.org/abs/2510.00003',
  });
}

// Adoption: a customer story that names a model version. It must never be read as that model's
// release, however prominently the version appears.
function adoptionAsana() {
  return item({
    id: 'itm_asana',
    source: 'OpenAI',
    source_key: 'openai',
    format: 'article',
    title: 'Asana cuts model costs 76x in browser tests with GPT-6.1 Sol',
    excerpt: 'Using GPT-6 Astra in Codex, Asana made its browser agent 76x cheaper and 5x faster in tests to offer the same capability at a fraction of the cost.',
    canonical_url: 'https://openai.com/index/asana-browser-agent',
  });
}

function adoptionSophos() {
  return item({
    id: 'itm_sophos',
    source: 'OpenAI',
    source_key: 'openai',
    format: 'article',
    title: 'Sophos cuts threat investigation time by 96% with OpenAI Daybreak',
    excerpt: 'Discover how Sophos uses OpenAI Daybreak to cut cyber-threat investigation time by 96% and automate 52% of MDR cases while preserving human oversight.',
    canonical_url: 'https://openai.com/index/sophos',
  });
}

function modelRelease() {
  return item({
    id: 'itm_gpt61',
    source: 'OpenAI',
    source_key: 'openai',
    format: 'article',
    title: 'Introducing GPT-6.1 Sol',
    excerpt: 'GPT-6.1 Sol is available today in the API and Codex, with a longer context window and native tool use.',
    canonical_url: 'https://openai.com/index/gpt-6-1-sol',
  });
}

function agentLightning() {
  return item({
    id: 'itm_lightning',
    source: 'Microsoft Research',
    source_key: 'microsoft-research',
    format: 'article',
    title: 'Agent Lightning v1.0: A 3,500-Line Lightweight Agentic RL Framework for Training Agents with Real Harnesses',
    excerpt: 'At a glance Harnessed Agentic RL: Microsoft Research Asia introduces a training paradigm in which the same agent harness used in deployment participates directly in reinforcement learning.',
    canonical_url: 'https://www.microsoft.com/en-us/research/blog/agent-lightning-v1-0/',
  });
}

function repoWithoutRelease() {
  return item({
    id: 'itm_repo',
    source: 'GitHub',
    source_key: 'github',
    format: 'project',
    title: 'vitali87/code-graph-rag',
    excerpt: 'The ultimate RAG for your monorepo. Query, understand, and edit multi-language codebases with the power of AI and knowledge graphs.',
    canonical_url: 'https://github.com/vitali87/code-graph-rag',
  });
}

function repoWithRelease() {
  return item({
    id: 'itm_repo_rel',
    source: 'GitHub',
    source_key: 'github',
    format: 'project',
    title: 'example/agent-runner',
    excerpt: 'v3.2.0 release notes: adds streaming trace export and a new CLI flag. See the changelog for the full list.',
    canonical_url: 'https://github.com/example/agent-runner',
  });
}

function collaborationItem() {
  return item({
    id: 'itm_collab',
    source: 'NVIDIA',
    source_key: 'nvidia',
    format: 'article',
    title: 'NVIDIA, Microsoft Kick Off a New Beginning for Windows PCs With RTX Spark and AI Agents',
    excerpt: 'At a Microsoft event in San Francisco, NVIDIA founder and CEO Jensen Huang and Microsoft CEO Satya Nadella outlined how the two companies are co-engineering hardware and software for AI agents to run on Windows PCs.',
    canonical_url: 'https://blogs.nvidia.com/blog/local-ai-rtx-spark-microsoft-windows-event/',
  });
}

function hiringItem() {
  return item({
    id: 'itm_hiring',
    source: 'Hacker News',
    source_key: 'hacker-news',
    format: 'post',
    title: 'Weave (YC W25) is hiring ML, AI, product, & design engineers',
    excerpt: '',
    canonical_url: 'https://jobs.ashbyhq.com/weave-os',
  });
}

function commentaryQuestion() {
  return item({
    id: 'itm_question',
    source: 'Hacker News',
    source_key: 'hacker-news',
    format: 'post',
    title: "Why isn't the industry freaking out about DeepSeek 4.1 Flash?",
    excerpt: '',
    canonical_url: 'https://www.dgt.is/blog/2026-10-07-deepseek-freek-out/',
  });
}

function commentaryInterview() {
  return item({
    id: 'itm_interview',
    source: 'TechCrunch',
    source_key: 'techcrunch-ai',
    format: 'article',
    title: "Microsoft's Satya Nadella says AI models need an 'emergency brake'",
    excerpt: 'Nadella said the industry needs a way to slow down deployment when a model behaves unexpectedly.',
    canonical_url: 'https://techcrunch.com/2026/10/10/nadella-emergency-brake/',
  });
}

function noTextItem() {
  return item({ id: 'itm_notext', title: '', excerpt: '', canonical_url: 'https://example.org/empty' });
}

function titleOnlyEvent() {
  return item({
    id: 'itm_titleonly',
    source: 'Google DeepMind',
    source_key: 'deepmind',
    title: 'Introducing Gemini 3.8 Flash',
    excerpt: '',
    canonical_url: 'https://deepmind.google/blog/introducing-gemini-3-8-flash/',
  });
}

// The Phase 2A gate exactly as it stood before this calibration: a named model or version, a named
// family with release language, a version-bearing token with release language, or a named artefact
// together with any word from the older, wider publication list. It is kept here so the before and
// after decisions are both computed rather than remembered.
const LEGACY_PUBLICATION_PHRASES = [
  'preprint', 'paper', 'journal', 'proceedings', 'arxiv', 'thesis', 'dissertation',
  'technical report', 'white paper', 'whitepaper', 'systematic review', 'survey',
  'we propose', 'we present', 'we introduce', 'we describe', 'we develop',
  'this paper', 'this study', 'this report', 'this work',
  'our method', 'our framework', 'our system', 'our dataset', 'our approach', 'our analysis',
  'benchmark suite', 'benchmark study', 'empirical study', 'empirical evaluation',
];

function legacyEligible(sample) {
  const text = `${sample.title || ''} ${sample.excerpt || ''}`;
  if (versionedTokens(text).length) return true;
  if (familyTokens(text).length && RELEASE_VERBS.test(text)) return true;
  if (numericDesignatorTokens(text).length && RELEASE_VERBS.test(text)) return true;
  const normalized = normalizeForMatch(text);
  const artifacts = researchArtifactTokens(sample.title);
  const language = LEGACY_PUBLICATION_PHRASES.filter((phrase) => normalized.includes(phrase));
  const quoted = artifacts.filter((artifact) => normalized.includes(normalizeForMatch(artifact)));
  return Boolean(artifacts.length && language.length && quoted.length);
}

function sampledRecords() {
  return [
    quine(), merit(), dreamtrue(), dexOne2Many(), rubricCepr(), milleMiglia(), genericSurvey(),
    adoptionAsana(), modelRelease(), agentLightning(), repoWithoutRelease(), repoWithRelease(),
    collaborationItem(), hiringItem(), commentaryQuestion(), commentaryInterview(),
    noTextItem(), titleOnlyEvent(),
  ];
}

const FEED_RUN = {
  run_id: 'run_cal_1', stage: DEV_ANALYSIS_CONFIG.stage, action: 'analyze', status: 'success',
  dry_run: false, execution_flag: true, kill_switch_state: 'on', claim_state: 'consumed',
  claim_token: 'token-abcdefgh', authorization_id: 'auth-abcdefgh', operator_role: 'admin',
  source_fingerprint: 'fp_cal_1',
};

const FEED_QUOTE = 'We propose Quine, a self-compiling language for agentic systems';

function feedDevelopment() {
  return {
    development_id: 'dev_cal_1', run_id: FEED_RUN.run_id, stage: DEV_ANALYSIS_CONFIG.stage,
    status: 'accepted', source_fingerprint: FEED_RUN.source_fingerprint,
    source_urls: ['https://arxiv.org/abs/2510.00001'], primary_published_at: '2026-10-04T09:00:00.000Z',
    title: 'Quine: A Self-Compiling Language for Agentic Systems', kind: 'research',
    kind_basis: 'research contribution from the stored text', summary: 'The paper proposes Quine.',
    why_it_matters: 'A self-compiling language for agentic systems.', claim_ids: ['claim_1'],
    supporting_item_ids: ['itm_quine'], support_state: 'evidence_supported_by_model',
    source_states_claim: true, evidence_supported_by_model: true,
    // The calibration fields a row written from now on carries. They must not reach the feed.
    analysis_eligible: true, event_type: 'research_contribution',
    event_type_basis: 'named artefact with contribution evidence: Quine',
    evidence_status: 'claim_quote_verified', calibration_reason: 'the stored text names this artefact',
    calibration: { reason_code: 'named_artifact_with_contribution_language', deterministic: true },
  };
}

function feedClaims() {
  return [{
    claim_id: 'claim_1', run_id: FEED_RUN.run_id, item_id: 'itm_quine', source: 'arXiv',
    canonical_url: 'https://arxiv.org/abs/2510.00001', published_at: '2026-10-04T09:00:00.000Z',
    evidence_quote: FEED_QUOTE, quote_in_record: true,
  }];
}

const FEED_PROJECTION_KEYS = [
  'development_id', 'title', 'kind', 'kind_label', 'kind_basis', 'summary', 'why_it_matters',
  'published_at', 'source', 'evidence', 'support', 'independent_verification', 'disclosure',
  'supporting_source_count',
];

export async function runCalibrationSuite() {
  const cases = [];
  const record = createCaseRecorder(cases);

  await record('research.dreamtrue_is_a_research_contribution', async () => {
    const row = calibrateSourceRecord(dreamtrue());
    return {
      ok: row.analysis_eligible === true && row.event_type === 'research_contribution'
        && row.evidence_status === 'stored_text_available'
        && row.event_type_basis.includes('DreamTrue'),
      note: { eligible: row.analysis_eligible, event_type: row.event_type, evidence_status: row.evidence_status, reason_code: row.reason_code },
    };
  });

  await record('research.dex_one2many_recognised_from_its_research_title', async () => {
    const paper = calibrateSourceRecord(dexOne2Many());
    const news = calibrateSourceRecord(dexAsNews());
    return {
      ok: paper.analysis_eligible === true && paper.event_type === 'research_contribution'
        && paper.reason_code === 'title_names_artefact_and_contribution_subtitle'
        && news.analysis_eligible === false && news.reason_code === 'no_publication_language',
      note: {
        stored_as_research: { eligible: paper.analysis_eligible, reason_code: paper.reason_code },
        same_title_from_a_news_source: { eligible: news.analysis_eligible, reason_code: news.reason_code },
      },
    };
  });

  await record('research.millemiglia_missing_excerpt_is_an_evidence_limitation', async () => {
    const row = calibrateSourceRecord(milleMiglia());
    const selection = selectAnalysable([milleMiglia()]);
    return {
      ok: row.analysis_eligible === true && row.event_type === 'research_contribution'
        && row.evidence_status === 'insufficient_stored_text'
        && selection.items.length === 0 && selection.excluded.length === 1
        && selection.excluded[0].content_state === CONTENT_STATES.title_only,
      note: {
        eligible: row.analysis_eligible, evidence_status: row.evidence_status,
        excluded_from_a_batch: selection.excluded[0].reason_code,
      },
    };
  });

  await record('classification.customer_case_study_is_not_a_model_release', async () => {
    const asana = classifyEvent(adoptionAsana());
    const sophos = classifyEvent(adoptionSophos());
    const release = classifyEvent(modelRelease());
    return {
      ok: asana.event_type === 'adoption_case_study' && asana.analysis_eligible === true
        && asana.model_identifiers.includes('gpt-6.1')
        && sophos.event_type === 'adoption_case_study'
        && release.event_type === 'model_release' && release.analysis_eligible === true,
      note: {
        case_study: asana.event_type, case_study_names: asana.model_identifiers,
        second_case_study: sophos.event_type, release_announcement: release.event_type,
      },
    };
  });

  await record('classification.agent_lightning_v1_is_a_software_release', async () => {
    const row = calibrateSourceRecord(agentLightning());
    return {
      ok: row.analysis_eligible === true && row.event_type === 'software_release'
        && row.event_type_basis.includes('version'),
      note: { eligible: row.analysis_eligible, event_type: row.event_type, basis: row.event_type_basis },
    };
  });

  await record('classification.repository_activity_is_not_a_release', async () => {
    const repo = calibrateSourceRecord(repoWithoutRelease());
    const released = calibrateSourceRecord(repoWithRelease());
    return {
      ok: repo.analysis_eligible === false && repo.event_type === 'other'
        && repo.reason_code === 'repository_without_release_evidence'
        && released.analysis_eligible === true && released.event_type === 'software_release',
      note: {
        repository_only: { eligible: repo.analysis_eligible, event_type: repo.event_type, reason_code: repo.reason_code },
        repository_with_release_notes: { eligible: released.analysis_eligible, event_type: released.event_type },
      },
    };
  });

  await record('classification.collaboration_and_hiring_are_not_developments', async () => {
    const collaboration = classifyEvent(collaborationItem());
    const hiring = classifyEvent(hiringItem());
    return {
      ok: collaboration.analysis_eligible === false && collaboration.event_type === 'other'
        && collaboration.reason_code === 'collaboration_announcement'
        && hiring.analysis_eligible === false && hiring.reason_code === 'hiring_notice',
      note: {
        collaboration: { eligible: collaboration.analysis_eligible, reason_code: collaboration.reason_code },
        hiring: { eligible: hiring.analysis_eligible, reason_code: hiring.reason_code },
      },
    };
  });

  await record('classification.commentary_and_generic_research_stay_out', async () => {
    const question = classifyEvent(commentaryQuestion());
    const interview = classifyEvent(commentaryInterview());
    const survey = calibrateSourceRecord(genericSurvey());
    return {
      ok: question.event_type === 'analysis_commentary' && question.analysis_eligible === false
        && interview.event_type === 'analysis_commentary' && interview.analysis_eligible === false
        && survey.analysis_eligible === false && survey.reason_code === 'no_contribution_language',
      note: {
        question_naming_a_version: { eligible: question.analysis_eligible, event_type: question.event_type },
        interview: { eligible: interview.analysis_eligible, event_type: interview.event_type },
        generic_research_article: { eligible: survey.analysis_eligible, reason_code: survey.reason_code },
      },
    };
  });

  await record('evidence.missing_text_and_unverified_quotes_are_reported_not_filled', async () => {
    const noText = calibrateSourceRecord(noTextItem());
    const titleOnly = calibrateSourceRecord(titleOnlyEvent());
    const source = buildSourceView([modelRelease()]);
    const unverified = calibrateDevelopment({ title: 'GPT-6.1 Sol released', sources: source, claims: [{ quote_in_record: false }] });
    const verified = calibrateDevelopment({ title: 'GPT-6.1 Sol released', sources: source, claims: [{ quote_in_record: true }] });
    return {
      ok: noText.evidence_status === 'no_stored_text' && noText.analysis_eligible === false
        && noText.reason_code === 'no_stored_text'
        && titleOnly.evidence_status === 'insufficient_stored_text' && titleOnly.analysis_eligible === true
        && unverified.evidence_status === 'stored_text_available' && unverified.claim_quotes_verified === 0
        && verified.evidence_status === 'claim_quote_verified' && verified.claim_quotes_verified === 1
        && evidenceStatusOf({ content_states: [CONTENT_STATES.no_text] }) === 'no_stored_text',
      note: {
        no_stored_text: noText.evidence_status,
        title_only: titleOnly.evidence_status,
        quote_not_verified: unverified.evidence_status,
        quote_verified: verified.evidence_status,
      },
    };
  });

  await record('calibration.before_and_after_on_the_sampled_records', async () => {
    const rows = sampledRecords().map((sample) => {
      const after = calibrateSourceRecord(sample);
      return {
        id: sample.id,
        before: legacyEligible(sample),
        after: after.analysis_eligible,
        event_type: after.event_type,
      };
    });
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    const gained = rows.filter((row) => !row.before && row.after).map((row) => row.id).sort();
    const lost = rows.filter((row) => row.before && !row.after).map((row) => row.id).sort();
    const stillTrue = rows.filter((row) => row.before && row.after).map((row) => row.id).sort();
    const stillFalse = rows.filter((row) => !row.before && !row.after).map((row) => row.id).sort();
    const expectedGained = ['itm_dex', 'itm_mille', 'itm_rubric'];
    const expectedLost = ['itm_ecology', 'itm_question'];
    return {
      ok: JSON.stringify(gained) === JSON.stringify(expectedGained)
        && JSON.stringify(lost) === JSON.stringify(expectedLost)
        && byId.itm_quine.after === true && byId.itm_merit.after === true
        && byId.itm_dreamtrue.after === true && byId.itm_gpt61.after === true
        && byId.itm_asana.event_type === 'adoption_case_study'
        && byId.itm_gpt61.event_type === 'model_release'
        && byId.itm_question.event_type === 'analysis_commentary'
        && byId.itm_ecology.event_type === 'other'
        && byId.itm_repo.after === false && byId.itm_hiring.after === false
        && stillTrue.length === 8 && stillFalse.length === 6,
      note: {
        before_eligible: rows.filter((row) => row.before).length,
        after_eligible: rows.filter((row) => row.after).length,
        gained, lost, still_eligible: stillTrue, still_ineligible: stillFalse,
        event_types: Object.fromEntries(rows.map((row) => [row.id, row.event_type])),
      },
    };
  });

  await record('excerpt.cdata_wrapped_description_survives_the_parser', async () => {
    const cdata = cleanExcerpt(
      'Sophos cuts threat investigation time by 96% with OpenAI Daybreak',
      '<![CDATA[Discover how Sophos uses OpenAI Daybreak to cut cyber-threat investigation time by 96% and automate 52% of MDR cases while preserving human oversight.]]>',
    );
    const empty = cleanExcerpt('Gemini 4 Argon: our next era of frontier intelligence', '<description/>');
    const markup = stripHtml('<p>Hello &amp; welcome</p><script>bad()</script>');
    return {
      ok: cdata.length >= 40 && cdata.includes('Sophos') && !cdata.includes('<') && !cdata.includes('CDATA')
        && empty === '' && markup === 'Hello & welcome',
      note: { cdata_excerpt_chars: cdata.length, empty_description_kept_empty: empty === '', markup_stripped: markup },
    };
  });

  await record('feed.projection_is_unchanged_and_carries_no_calibration_fields', async () => {
    const feed = resolveFeed({
      developments: [feedDevelopment()],
      runsById: { [FEED_RUN.run_id]: FEED_RUN },
      claimsByRun: { [FEED_RUN.run_id]: feedClaims() },
      limit: 6,
    });
    const projected = feed.items[0];
    const serialized = JSON.stringify(projected || {});
    const calibrationFields = ['event_type', 'evidence_status', 'analysis_eligible', 'calibration'];
    return {
      ok: feed.items.length === 1 && Boolean(projected)
        && Object.keys(projected).length === FEED_PROJECTION_KEYS.length
        && Object.keys(projected).every((key) => FEED_PROJECTION_KEYS.includes(key))
        && calibrationFields.every((key) => !serialized.includes(key))
        && projected.independent_verification === 'not_performed'
        && projected.evidence.quote === FEED_QUOTE,
      note: {
        keys: projected ? Object.keys(projected) : [],
        calibration_fields_leaked: calibrationFields.filter((key) => serialized.includes(key)),
      },
    };
  });

  await record('calibration.is_deterministic_and_side_effect_free', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('the calibration suite must not fetch anything'); };
    try {
      const first = sampledRecords().map(calibrateSourceRecord);
      const second = sampledRecords().map(calibrateSourceRecord);
      const summary = summarizeCalibration(first);
      return {
        ok: JSON.stringify(first) === JSON.stringify(second)
          && summary.records === first.length
          && summary.analysis_eligible + summary.ineligible === summary.records
          && Object.keys(summary.by_event_type).every((key) => EVENT_TYPES.includes(key))
          && summary.samples.length <= summary.sample_cap,
        note: {
          records: summary.records, eligible: summary.analysis_eligible,
          by_event_type: summary.by_event_type, by_evidence_status: summary.by_evidence_status,
          ineligible_reasons: summary.ineligible_reasons,
        },
      };
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await record('limitations.declared', async () => {
    const required = [
      'deterministic', 'kind_unchanged', 'not_a_claim_about_the_world', 'adoption_detection',
      'software_release', 'research_recognition', 'missing_text', 'historical_records',
    ];
    const missing = required.filter((key) => !CALIBRATION_LIMITATIONS[key]);
    return { ok: missing.length === 0, note: { undocumented: missing, declared: required.length } };
  });

  const passed = cases.filter((entry) => entry.ok).length;
  return {
    suite: 'phase3c-development-calibration-suite',
    stage: DEV_ANALYSIS_CONFIG.stage,
    cases_run: cases.length,
    passed,
    failed: cases.length - passed,
    live_path_provider_calls: 0,
    live_path_model_calls: 0,
    live_path_writes: 0,
    cases,
  };
}