import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  getDashboardMessages,
  type DashboardLanguage,
  type DashboardMessages,
} from "./languages";

type Severity = "critical" | "high" | "medium" | "low";
type DriftType =
  | "comment_drift"
  | "documentation_drift"
  | "api_contract_drift"
  | "config_drift"
  | "test_drift";

type AnalysisScope =
  | {
      mode: "full";
    }
  | {
      mode: "diff";
      changedFiles: string[];
      impactExpansionDepth: number;
      impactedArtifactIds: string[];
      impactedFiles: string[];
    };

type PersistedScanJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "processing" | "completed" | "failed";
  repositoryPath: string;
  changedFiles: string[];
  repositoryFullName?: string;
  pullRequestNumber?: number;
  deliveryId?: string;
};

type FindingScore = {
  structural: number;
  semantic: number;
  diff: number;
  history: number;
  final: number;
  threshold: number;
};

type FindingRelatedArtifact = {
  artifactId: string;
  role: "primary" | "secondary" | "context";
};

type SemanticReview = {
  provider: string;
  model: string;
  explanation: string;
  semanticAssessment: "aligned" | "contradictory" | "uncertain";
  suggestedFix: string | null;
  userMessage: string;
};

type Finding = {
  id: string;
  schemaVersion: string;
  ruleVersion: string;
  fingerprint: string;
  type: DriftType;
  severity: Severity;
  confidence: number;
  score: FindingScore;
  publishable: boolean;
  userMessage: string;
  file: string;
  relatedFile?: string;
  relatedArtifactIds: string[];
  relatedArtifacts: FindingRelatedArtifact[];
  evidence: string;
  suggestedFix?: string;
  semanticReview?: SemanticReview;
};

type RepositoryScanSummary = {
  findingSchemaVersion: string;
  analysisScope: AnalysisScope;
  rootPath: string;
  scannedAt: string;
  totalFindings: number;
  findingCounts: Record<DriftType, number>;
  findings: Finding[];
};

type PersistedFindingsReport = {
  job: PersistedScanJob;
  producedAt: string;
  summary: RepositoryScanSummary;
  pullRequestCommentBody: string;
};

type FindingsReportFeedItem = {
  jobId: string;
  producedAt: string;
  repositoryPath: string;
  repositoryFullName?: string;
  pullRequestNumber?: number;
  findings: number;
  publishableFindings: number;
  analysisMode: "full" | "diff";
  findingSchemaVersion: string;
  status: PersistedScanJob["status"];
};

type FindingsFeedResponse = {
  totalReports: number;
  reports: FindingsReportFeedItem[];
};

type Filters = {
  severity: "all" | Severity;
  type: "all" | DriftType;
  publishableOnly: boolean;
  search: string;
};

type AppState = {
  feed: FindingsReportFeedItem[];
  reportCache: Map<string, PersistedFindingsReport>;
  selectedJobId: string | null;
  selectedFindingId: string | null;
  loadingFeed: boolean;
  loadingReport: boolean;
  error: string | null;
  filters: Filters;
  language: DashboardLanguage;
};

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root element");
}

const appRoot = rootElement;

const DASHBOARD_LANGUAGE_STORAGE_KEY = "driftlyzer.dashboard.language";
const DASHBOARD_LOGO_SRC = "/logo.png";

function isDashboardLanguage(value: string): value is DashboardLanguage {
  return LANGUAGE_OPTIONS.some((option) => option.code === value);
}

function readInitialLanguage(): DashboardLanguage {
  try {
    const saved = localStorage.getItem(DASHBOARD_LANGUAGE_STORAGE_KEY);

    if (saved && isDashboardLanguage(saved)) {
      return saved;
    }
  } catch {
    // Ignore localStorage read errors and fallback to default language.
  }

  return DEFAULT_LANGUAGE;
}

function persistLanguage(language: DashboardLanguage): void {
  try {
    localStorage.setItem(DASHBOARD_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore localStorage write errors.
  }
}

function applyDocumentLanguage(language: DashboardLanguage): void {
  document.documentElement.lang = language;
}

const initialLanguage = readInitialLanguage();
applyDocumentLanguage(initialLanguage);

const state: AppState = {
  feed: [],
  reportCache: new Map(),
  selectedJobId: null,
  selectedFindingId: null,
  loadingFeed: false,
  loadingReport: false,
  error: null,
  language: initialLanguage,
  filters: {
    severity: "all",
    type: "all",
    publishableOnly: false,
    search: "",
  },
};

type DashboardVisualCopy = {
  tagline: string;
  navOverview: string;
  navFindings: string;
  navRepositories: string;
  navRules: string;
  navSettings: string;
  driftScore: string;
  criticalIssues: string;
  lastScan: string;
  syncState: string;
  findingsTable: string;
  repositoriesPanel: string;
  selectedFinding: string;
  serviceGraph: string;
  diffViewer: string;
  codeBlock: string;
  file: string;
  status: string;
  statusCritical: string;
  statusWarning: string;
  statusOk: string;
  noDiffContext: string;
  noCodeContext: string;
  noGraphContext: string;
  graphHint: string;
};

const DASHBOARD_VISUAL_COPY: Record<DashboardLanguage, DashboardVisualCopy> = {
  "pt-BR": {
    tagline: "Contratos, documentação e configuração em uma leitura só.",
    navOverview: "Resumo",
    navFindings: "Achados",
    navRepositories: "Execuções",
    navRules: "Cobertura",
    navSettings: "Ajustes",
    driftScore: "Índice de consistência",
    criticalIssues: "Achados críticos",
    lastScan: "Última análise",
    syncState: "Atualização",
    findingsTable: "Lista de achados",
    repositoriesPanel: "Execuções recentes",
    selectedFinding: "Detalhe do achado",
    serviceGraph: "Panorama por área",
    diffViewer: "Mudança relacionada",
    codeBlock: "Resumo técnico",
    file: "Arquivo",
    status: "Status",
    statusCritical: "Crítico",
    statusWarning: "Atenção",
    statusOk: "Saudável",
    noDiffContext: "Selecione um finding para visualizar o diff contextual.",
    noCodeContext: "Selecione um finding para visualizar o resumo técnico.",
    noGraphContext:
      "Selecione uma execução para visualizar a distribuição por área.",
    graphHint: "Leitura resumida por domínio.",
  },
  en: {
    tagline: "Contracts, docs, and config in one clear view.",
    navOverview: "Overview",
    navFindings: "Findings",
    navRepositories: "Runs",
    navRules: "Coverage",
    navSettings: "Settings",
    driftScore: "Consistency Index",
    criticalIssues: "Critical Findings",
    lastScan: "Last Review",
    syncState: "Sync",
    findingsTable: "Findings List",
    repositoriesPanel: "Recent Runs",
    selectedFinding: "Finding Detail",
    serviceGraph: "Area Overview",
    diffViewer: "Related Change",
    codeBlock: "Technical Summary",
    file: "File",
    status: "Status",
    statusCritical: "Critical",
    statusWarning: "Attention",
    statusOk: "Healthy",
    noDiffContext: "Select a finding to inspect contextual diff.",
    noCodeContext: "Select a finding to inspect the technical summary.",
    noGraphContext: "Select a run to inspect the area breakdown.",
    graphHint: "Compact domain-level overview.",
  },
  es: {
    tagline: "Contratos, docs y configuración en una sola vista.",
    navOverview: "Resumen",
    navFindings: "Hallazgos",
    navRepositories: "Ejecuciones",
    navRules: "Cobertura",
    navSettings: "Ajustes",
    driftScore: "Índice de consistencia",
    criticalIssues: "Hallazgos críticos",
    lastScan: "Último análisis",
    syncState: "Actualización",
    findingsTable: "Tabla de Hallazgos",
    repositoriesPanel: "Ejecuciones recientes",
    selectedFinding: "Detalle del hallazgo",
    serviceGraph: "Panorama por área",
    diffViewer: "Cambio relacionado",
    codeBlock: "Resumen técnico",
    file: "Archivo",
    status: "Estado",
    statusCritical: "Crítico",
    statusWarning: "Atención",
    statusOk: "Saludable",
    noDiffContext: "Selecciona un hallazgo para ver el diff contextual.",
    noCodeContext: "Selecciona un hallazgo para ver el resumen técnico.",
    noGraphContext:
      "Selecciona una ejecución para ver la distribución por área.",
    graphHint: "Lectura resumida por dominio.",
  },
  fr: {
    tagline: "Contrats, docs et configuration dans une vue claire.",
    navOverview: "Vue générale",
    navFindings: "Constats",
    navRepositories: "Exécutions",
    navRules: "Couverture",
    navSettings: "Réglages",
    driftScore: "Indice de cohérence",
    criticalIssues: "Constats critiques",
    lastScan: "Dernière analyse",
    syncState: "Mise à jour",
    findingsTable: "Table des Constats",
    repositoriesPanel: "Exécutions récentes",
    selectedFinding: "Détail du constat",
    serviceGraph: "Vue par domaine",
    diffViewer: "Changement lié",
    codeBlock: "Résumé technique",
    file: "Fichier",
    status: "Statut",
    statusCritical: "Critique",
    statusWarning: "Attention",
    statusOk: "Stable",
    noDiffContext: "Selectionnez un constat pour voir le diff contextuel.",
    noCodeContext: "Selectionnez un constat pour voir le resume technique.",
    noGraphContext:
      "Selectionnez une execution pour voir la repartition par domaine.",
    graphHint: "Lecture resumee par domaine.",
  },
};

function getVisualCopy(language: DashboardLanguage): DashboardVisualCopy {
  return (
    DASHBOARD_VISUAL_COPY[language] ?? DASHBOARD_VISUAL_COPY[DEFAULT_LANGUAGE]
  );
}

void boot();

async function boot(): Promise<void> {
  await loadFeed();
}

async function loadFeed(): Promise<void> {
  state.loadingFeed = true;
  state.error = null;
  render();

  try {
    const response = await fetch("/findings/reports");

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as FindingsFeedResponse;
    state.feed = payload.reports;

    if (!state.selectedJobId && state.feed.length > 0) {
      state.selectedJobId = state.feed[0]?.jobId ?? null;
    }

    if (state.selectedJobId) {
      await loadReport(state.selectedJobId);
    }
  } catch (error: unknown) {
    const messages = getDashboardMessages(state.language);
    const message = error instanceof Error ? error.message : "Unknown error";
    state.error = `${messages.feedLoadErrorPrefix}: ${message}`;
  } finally {
    state.loadingFeed = false;
    render();
  }
}

async function loadReport(jobId: string): Promise<void> {
  if (state.reportCache.has(jobId)) {
    ensureSelectedFinding();
    render();
    return;
  }

  state.loadingReport = true;
  state.error = null;
  render();

  try {
    const response = await fetch(
      `/findings/reports/${encodeURIComponent(jobId)}`,
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const report = (await response.json()) as PersistedFindingsReport;
    state.reportCache.set(jobId, report);
    ensureSelectedFinding();
  } catch (error: unknown) {
    const messages = getDashboardMessages(state.language);
    const message = error instanceof Error ? error.message : "Unknown error";
    state.error = `${messages.reportLoadErrorPrefix} ${jobId}: ${message}`;
  } finally {
    state.loadingReport = false;
    render();
  }
}

function getSelectedReport(): PersistedFindingsReport | null {
  if (!state.selectedJobId) {
    return null;
  }

  return state.reportCache.get(state.selectedJobId) ?? null;
}

function getFilteredFindings(
  report: PersistedFindingsReport | null,
): Finding[] {
  if (!report) {
    return [];
  }

  return report.summary.findings.filter((finding) => {
    if (
      state.filters.severity !== "all" &&
      finding.severity !== state.filters.severity
    ) {
      return false;
    }

    if (state.filters.type !== "all" && finding.type !== state.filters.type) {
      return false;
    }

    if (state.filters.publishableOnly && !finding.publishable) {
      return false;
    }

    if (!state.filters.search.trim()) {
      return true;
    }

    const query = state.filters.search.trim().toLowerCase();
    const haystack = [
      finding.id,
      finding.evidence,
      finding.userMessage,
      finding.file,
      finding.relatedFile ?? "",
      finding.fingerprint,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function ensureSelectedFinding(): void {
  const report = getSelectedReport();
  const findings = getFilteredFindings(report);

  if (findings.length === 0) {
    state.selectedFindingId = null;
    return;
  }

  const currentlySelected = findings.some(
    (finding) => finding.id === state.selectedFindingId,
  );

  if (!currentlySelected) {
    state.selectedFindingId = findings[0]?.id ?? null;
  }
}

function render(): void {
  const report = getSelectedReport();
  const findings = getFilteredFindings(report);
  const selectedFinding = findings.find(
    (finding) => finding.id === state.selectedFindingId,
  );
  const totalFindings = state.feed.reduce(
    (sum, item) => sum + item.findings,
    0,
  );
  const totalPublishable = state.feed.reduce(
    (sum, item) => sum + item.publishableFindings,
    0,
  );
  const reportFindings = report?.summary.findings ?? [];
  const driftScore =
    reportFindings.length > 0
      ? reportFindings.reduce((sum, finding) => sum + finding.score.final, 0) /
        reportFindings.length
      : 0;
  const criticalIssues = reportFindings.filter(
    (finding) => finding.severity === "critical",
  ).length;
  const lastScan = report
    ? formatTimestamp(report.producedAt, state.language)
    : "-";
  const selectedFeedItem =
    state.feed.find((item) => item.jobId === state.selectedJobId) ?? null;
  const visualCopy = getVisualCopy(state.language);
  const messages = getDashboardMessages(state.language);
  const syncTone = resolveSyncTone(
    selectedFeedItem?.status,
    Boolean(state.error),
  );
  const syncLabel = state.error
    ? state.error
    : selectedFeedItem
      ? messages.statusLabels[selectedFeedItem.status]
      : messages.ready;

  appRoot.className =
    "relative min-h-screen overflow-x-hidden p-3 md:p-4 text-[#E5E7EB]";

  document.title = `Driftlyzer - ${messages.title}`;

  appRoot.innerHTML = `
    <div
      class="pointer-events-none fixed inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,_transparent_1px),linear-gradient(90deg,_rgba(148,163,184,0.08)_1px,_transparent_1px)] [background-size:56px_56px]"
      aria-hidden="true"
    ></div>
    <div
      class="pointer-events-none fixed inset-0 [background-image:radial-gradient(1200px_600px_at_84%_-8%,_rgba(99,102,241,0.16),_transparent_55%),radial-gradient(900px_500px_at_-10%_112%,_rgba(99,102,241,0.08),_transparent_54%)]"
      aria-hidden="true"
    ></div>
    <div class="relative mx-auto grid w-[min(1460px,96vw)] grid-cols-1 gap-4 xl:grid-cols-[272px_minmax(0,1fr)]">
      <aside class="rounded-2xl border border-white/10 bg-[#111827] p-4 xl:sticky xl:top-3 xl:min-h-[calc(100vh-1.5rem)]">
        <div class="flex h-full flex-col gap-4">
          <div>
            <p class="m-0 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]"><span class="h-px w-3 bg-current/80"></span>${escapeHtml(messages.missionControl)}</p>
            <div class="mt-3 w-full max-w-[194px]" aria-hidden="true">
              <img
                class="block h-auto max-h-[104px] w-full object-contain object-left"
                src="${escapeHtml(DASHBOARD_LOGO_SRC)}"
                alt=""
                loading="eager"
                decoding="async"
              />
            </div>
            <h1 class="mt-3 font-sans text-[1.55rem] font-semibold tracking-[-0.02em] text-[#F3F4F6]">Driftlyzer</h1>
            <p class="mt-2 max-w-[29ch] text-sm leading-6 text-[#9CA3AF]">${escapeHtml(visualCopy.tagline)}</p>
            <div class="${syncIndicatorClasses(syncTone)}">
              <span class="inline-block h-2 w-2 rounded-full bg-current"></span>
              <span>${escapeHtml(visualCopy.syncState)}: ${escapeHtml(syncLabel)}</span>
            </div>
          </div>

          <nav class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            ${renderNavItem(visualCopy.navOverview, true)}
            ${renderNavItem(visualCopy.navFindings)}
            ${renderNavItem(visualCopy.navRepositories)}
            ${renderNavItem(visualCopy.navRules)}
            ${renderNavItem(visualCopy.navSettings)}
          </nav>

          <div class="mt-auto grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1">
            <label class="flex flex-col gap-1.5 text-xs text-[#9CA3AF]">
              ${escapeHtml(messages.language)}
              <select id="language-select" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB] outline-none transition focus:border-[#6366F1]/80 focus:ring-2 focus:ring-[#6366F1]/30">
                ${renderLanguageOptions(state.language)}
              </select>
            </label>
            <button id="refresh-feed" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-4 text-sm font-semibold text-[#E5E7EB] transition hover:border-white/20 hover:bg-[#162034] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30">${escapeHtml(messages.refresh)}</button>
          </div>
        </div>
      </aside>

      <main class="grid min-w-0 gap-4">
        <header class="rounded-2xl border border-white/10 bg-[#111827] p-4">
          <p class="m-0 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]"><span class="h-px w-3 bg-current/80"></span>${escapeHtml(messages.title)}</p>
          <h2 class="mt-2 max-w-[68ch] text-[clamp(1.02rem,1.3vw,1.18rem)] font-medium leading-7 text-[#CBD5E1]">${escapeHtml(messages.subtitle)}</h2>
        </header>

        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article class="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">${escapeHtml(visualCopy.driftScore)}</span>
            <strong class="mt-2 block text-4xl font-semibold leading-none text-[#F3F4F6] [font-variant-numeric:tabular-nums]">${Math.round(driftScore * 100)}%</strong>
            <p class="mt-2 text-sm text-[#9CA3AF]">${reportFindings.length} ${escapeHtml(messages.findings)}</p>
          </article>
          <article class="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">${escapeHtml(visualCopy.criticalIssues)}</span>
            <strong class="mt-2 block text-4xl font-semibold leading-none text-[#F3F4F6] [font-variant-numeric:tabular-nums]">${criticalIssues}</strong>
            <p class="mt-2 text-sm text-[#9CA3AF]">${totalFindings} ${escapeHtml(messages.findings)}</p>
          </article>
          <article class="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">${escapeHtml(visualCopy.lastScan)}</span>
            <strong class="mt-2 block text-xl font-semibold leading-6 text-[#F3F4F6] [font-variant-numeric:tabular-nums]">${escapeHtml(lastScan)}</strong>
            <p class="mt-2 text-sm text-[#9CA3AF]">${totalPublishable} ${escapeHtml(messages.publishable)}</p>
          </article>
        </section>

        <section class="rounded-2xl border border-white/10 bg-[#111827] p-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 class="m-0 text-sm font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.findingsTable)}</h3>
            <span class="text-xs text-[#9CA3AF]">${findings.length}</span>
          </div>
          <div class="mb-3 grid gap-2 md:grid-cols-[0.92fr_0.92fr_1.2fr_auto]">
            <label class="flex flex-col gap-1.5 text-xs text-[#9CA3AF]">
              ${escapeHtml(messages.severity)}
              <select id="filter-severity" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB] outline-none transition focus:border-[#6366F1]/80 focus:ring-2 focus:ring-[#6366F1]/30">
                ${renderSeverityOptions(state.filters.severity, messages)}
              </select>
            </label>
            <label class="flex flex-col gap-1.5 text-xs text-[#9CA3AF]">
              ${escapeHtml(messages.type)}
              <select id="filter-type" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB] outline-none transition focus:border-[#6366F1]/80 focus:ring-2 focus:ring-[#6366F1]/30">
                ${renderTypeOptions(state.filters.type, messages)}
              </select>
            </label>
            <label class="flex flex-col gap-1.5 text-xs text-[#9CA3AF]">
              ${escapeHtml(messages.search)}
              <input id="filter-search" type="search" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB] outline-none transition placeholder:text-[#9CA3AF]/80 focus:border-[#6366F1]/80 focus:ring-2 focus:ring-[#6366F1]/30" placeholder="${escapeHtml(
                messages.searchPlaceholder,
              )}" value="${escapeHtml(state.filters.search)}" />
            </label>
            <label class="inline-flex min-h-10 items-center gap-2 self-end rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB]">
              <input id="filter-publishable" type="checkbox" class="h-4 w-4 accent-[#6366F1]" ${
                state.filters.publishableOnly ? "checked" : ""
              } />
              ${escapeHtml(messages.publishableOnly)}
            </label>
          </div>
          <div class="overflow-auto rounded-xl border border-white/10 bg-[#0F172A]">
            ${renderFindingsTable(findings, messages, visualCopy)}
          </div>
        </section>

        <section class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.18fr)_minmax(0,1fr)]">
          <article class="min-w-0 rounded-2xl border border-white/10 bg-[#111827] p-4">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="m-0 text-sm font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.repositoriesPanel)}</h3>
              <span class="text-xs text-[#9CA3AF]">${state.feed.length}</span>
            </div>
            <div class="max-h-[420px] overflow-auto pr-0.5">
              ${renderReportsList(messages)}
            </div>
          </article>

          <article class="min-w-0 rounded-2xl border border-white/10 bg-[#111827] p-4 ${
            selectedFinding && findingHealthTone(selectedFinding) === "critical"
              ? "border-[#EF4444]/40"
              : ""
          }">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="m-0 text-sm font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.selectedFinding)}</h3>
              <span class="text-xs text-[#9CA3AF]">${
                selectedFinding
                  ? severityLabel(selectedFinding.severity, messages)
                  : "-"
              }</span>
            </div>
            <div class="max-h-[420px] overflow-auto pr-0.5">
              ${renderFindingDetail(selectedFinding, report, messages)}
            </div>
          </article>

          <article class="min-w-0 rounded-2xl border border-white/10 bg-[#111827] p-4 xl:col-span-2 2xl:col-span-1">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="m-0 text-sm font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.serviceGraph)}</h3>
              <span class="text-xs text-[#9CA3AF]">${escapeHtml(visualCopy.graphHint)}</span>
            </div>
            ${renderServiceGraph(report)}
          </article>
        </section>

        <section class="grid gap-4 xl:grid-cols-2">
          <article class="min-w-0 rounded-2xl border border-white/10 bg-[#111827] p-4">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h3 class="m-0 text-sm font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.diffViewer)}</h3>
            </div>
            ${renderDiffViewer(selectedFinding, visualCopy)}
          </article>

          <article class="min-w-0 rounded-2xl border border-white/10 bg-[#111827] p-4">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h3 class="m-0 text-sm font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.codeBlock)}</h3>
            </div>
            ${renderFindingCodeBlock(selectedFinding, visualCopy)}
          </article>
        </section>

        <footer class="rounded-xl border px-3 py-2 text-xs ${
          state.error
            ? "border-[#EF4444]/35 bg-[#EF4444]/10 text-[#EF4444]"
            : "border-white/10 bg-[#0F172A] text-[#CBD5E1]"
        }">
          ${
            state.loadingFeed || state.loadingReport
              ? escapeHtml(messages.loadingData)
              : state.error
                ? escapeHtml(state.error)
                : escapeHtml(messages.ready)
          }
        </footer>
      </main>
    </div>
  `;

  bindEvents();
}

function renderReportsList(messages: DashboardMessages): string {
  if (state.loadingFeed && state.feed.length === 0) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(messages.fetchingReports)}</p>`;
  }

  if (state.feed.length === 0) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(messages.noFeed)}</p>`;
  }

  return state.feed
    .map((item) => {
      const selected = item.jobId === state.selectedJobId ? "selected" : "";
      const repo = item.repositoryFullName ?? item.repositoryPath;

      return `
        <button class="w-full rounded-xl border px-3 py-3 text-left transition ${reportItemClasses(selected)}" data-report-id="${escapeHtml(item.jobId)}">
          <div class="flex items-start justify-between gap-2">
            <strong class="break-all text-sm font-semibold text-[#F3F4F6]">${escapeHtml(repo)}</strong>
            <span class="${statusPillClasses(item.status)}">${escapeHtml(messages.statusLabels[item.status])}</span>
          </div>
          <p class="mt-2 text-xs text-[#9CA3AF]">#${item.pullRequestNumber ?? escapeHtml(messages.reportLocalLabel)} • ${escapeHtml(messages.analysisModeLabels[item.analysisMode])}</p>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-lg font-semibold text-[#F3F4F6]">${item.findings}</span>
            <small class="text-xs text-[#9CA3AF]">${item.publishableFindings} ${escapeHtml(messages.reportPublishedShort)}</small>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderFindingsTable(
  findings: Finding[],
  messages: DashboardMessages,
  visualCopy: DashboardVisualCopy,
): string {
  if (!state.selectedJobId) {
    return `<p class="px-3 py-2 text-sm text-[#9CA3AF]">${escapeHtml(messages.selectReport)}</p>`;
  }

  if (state.loadingReport && !getSelectedReport()) {
    return `<p class="px-3 py-2 text-sm text-[#9CA3AF]">${escapeHtml(messages.loadingReport)}</p>`;
  }

  if (findings.length === 0) {
    return `<p class="px-3 py-2 text-sm text-[#9CA3AF]">${escapeHtml(messages.noFindingsForFilters)}</p>`;
  }

  const rows = findings
    .map((finding) => {
      const selected = finding.id === state.selectedFindingId ? "selected" : "";
      const tone = findingHealthTone(finding);
      const statusLabel =
        tone === "critical"
          ? visualCopy.statusCritical
          : tone === "warning"
            ? visualCopy.statusWarning
            : visualCopy.statusOk;

      return `
        <tr class="${findingRowClasses(selected, tone)}" data-finding-id="${escapeHtml(finding.id)}" tabindex="0" role="button">
          <td class="px-3 py-3"><span class="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-semibold leading-none text-[#CBD5E1]">${escapeHtml(messages.typeLabels[finding.type])}</span></td>
          <td class="px-3 py-3"><span class="${severityBadgeClasses(finding.severity)}">${severityLabel(finding.severity, messages)}</span></td>
          <td class="px-3 py-3 font-mono text-xs [font-variant-numeric:tabular-nums] text-[#CBD5E1]">${finding.score.final.toFixed(2)}</td>
          <td class="px-3 py-3 font-mono text-xs [font-variant-numeric:tabular-nums] text-[#CBD5E1]">${escapeHtml(finding.file)}</td>
          <td class="px-3 py-3"><span class="${statusBadgeClasses(tone)}">${escapeHtml(statusLabel)}</span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="w-full min-w-[690px] border-collapse">
      <thead>
        <tr>
          <th class="sticky top-0 z-[1] border-b border-white/10 bg-[#101826] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.type)}</th>
          <th class="sticky top-0 z-[1] border-b border-white/10 bg-[#101826] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.severity)}</th>
          <th class="sticky top-0 z-[1] border-b border-white/10 bg-[#101826] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">Score</th>
          <th class="sticky top-0 z-[1] border-b border-white/10 bg-[#101826] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(visualCopy.file)}</th>
          <th class="sticky top-0 z-[1] border-b border-white/10 bg-[#101826] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(visualCopy.status)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function renderFindingDetail(
  finding: Finding | undefined,
  report: PersistedFindingsReport | null,
  messages: DashboardMessages,
): string {
  if (!finding || !report) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(messages.chooseFinding)}</p>`;
  }

  const scope = report.summary.analysisScope;
  const scopeSummary =
    scope.mode === "diff"
      ? `${messages.analysisModeLabels.diff} • ${scope.changedFiles.length} ${messages.changed} • ${messages.depth} ${scope.impactExpansionDepth}`
      : messages.analysisModeLabels.full;

  return `
    <section class="mb-4 border-b border-white/10 pb-4">
      <h3 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.typeLabels[finding.type])} • ${severityLabel(finding.severity, messages)}</h3>
      <p class="mt-2 text-sm leading-6 text-[#CBD5E1]">${escapeHtml(finding.evidence)}</p>
    </section>
    <section class="mb-4 grid gap-3 border-b border-white/10 pb-4 sm:grid-cols-2">
      <div class="grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.id)}</span><code class="break-words font-mono text-xs text-[#C7D2FE]">${escapeHtml(finding.id)}</code></div>
      <div class="grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.fingerprint)}</span><code class="break-words font-mono text-xs text-[#C7D2FE]">${escapeHtml(finding.fingerprint)}</code></div>
      <div class="grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.rule)}</span><code class="break-words font-mono text-xs text-[#C7D2FE]">${escapeHtml(finding.ruleVersion)}</code></div>
      <div class="grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.schema)}</span><code class="break-words font-mono text-xs text-[#C7D2FE]">${escapeHtml(finding.schemaVersion)}</code></div>
      <div class="grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.scope)}</span><code class="break-words font-mono text-xs text-[#C7D2FE]">${escapeHtml(scopeSummary)}</code></div>
      <div class="grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.publishable)}</span><code class="break-words font-mono text-xs text-[#C7D2FE]">${finding.publishable ? escapeHtml(messages.publishableYes) : escapeHtml(messages.publishableNo)}</code></div>
    </section>
    <section class="mb-4 border-b border-white/10 pb-4">
      <h4 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.scoreBreakdown)}</h4>
      ${renderScoreMeter("structural", finding.score.structural, messages)}
      ${renderScoreMeter("semantic", finding.score.semantic, messages)}
      ${renderScoreMeter("diff", finding.score.diff, messages)}
      ${renderScoreMeter("history", finding.score.history, messages)}
      ${renderScoreMeter("final", finding.score.final, messages, finding.score.threshold)}
    </section>
    <section class="mb-4 border-b border-white/10 pb-4">
      <h4 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.paths)}</h4>
      <p class="mt-2 text-sm leading-6 text-[#CBD5E1]"><strong class="font-semibold text-[#E5E7EB]">${escapeHtml(messages.primary)}:</strong> ${escapeHtml(finding.file)}</p>
      <p class="mt-1 text-sm leading-6 text-[#CBD5E1]"><strong class="font-semibold text-[#E5E7EB]">${escapeHtml(messages.related)}:</strong> ${escapeHtml(finding.relatedFile ?? "-")}</p>
      <p class="mt-1 text-sm leading-6 text-[#CBD5E1]"><strong class="font-semibold text-[#E5E7EB]">${escapeHtml(messages.artifacts)}:</strong> ${escapeHtml(
        finding.relatedArtifactIds.join(", "),
      )}</p>
    </section>
    <section class="mb-4 border-b border-white/10 pb-4">
      <h4 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.suggestedFix)}</h4>
      <p class="mt-2 text-sm leading-6 text-[#CBD5E1]">${escapeHtml(finding.suggestedFix ?? messages.noSuggestion)}</p>
    </section>
    <section>
      <h4 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.semanticAssist)}</h4>
      <p class="mt-2 text-sm leading-6 text-[#CBD5E1]">${
        finding.semanticReview
          ? `${escapeHtml(finding.semanticReview.model)} • ${escapeHtml(
              finding.semanticReview.semanticAssessment,
            )} • ${escapeHtml(finding.semanticReview.explanation)}`
          : escapeHtml(messages.noSemanticReview)
      }</p>
    </section>
  `;
}

function renderNavItem(label: string, active = false): string {
  const activeClasses = active
    ? "border-[#6366F1]/45 bg-[#6366F1]/20 text-[#F3F4F6]"
    : "border-white/10 bg-transparent text-[#E5E7EB] hover:border-white/20 hover:bg-[#6366F1]/10";

  return `<button class="min-h-10 rounded-xl border px-3 text-left text-sm font-semibold transition ${activeClasses}" type="button">${escapeHtml(label)}</button>`;
}

function syncIndicatorClasses(tone: "critical" | "warning" | "ok"): string {
  const base =
    "mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium";

  if (tone === "critical") {
    return `${base} border-[#EF4444]/40 bg-[#EF4444]/12 text-[#EF4444]`;
  }

  if (tone === "warning") {
    return `${base} border-[#F59E0B]/40 bg-[#F59E0B]/12 text-[#F59E0B]`;
  }

  return `${base} border-[#22C55E]/35 bg-[#22C55E]/10 text-[#22C55E]`;
}

function reportItemClasses(selected: string): string {
  if (selected) {
    return "border-[#6366F1]/45 bg-[#6366F1]/16";
  }

  return "border-white/10 bg-[#0F172A] hover:border-white/20 hover:bg-[#162034]";
}

function statusPillClasses(status: PersistedScanJob["status"]): string {
  const base =
    "inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em]";

  if (status === "completed") {
    return `${base} border-[#22C55E]/35 bg-[#22C55E]/10 text-[#22C55E]`;
  }

  if (status === "failed") {
    return `${base} border-[#EF4444]/35 bg-[#EF4444]/10 text-[#EF4444]`;
  }

  return `${base} border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]`;
}

function findingRowClasses(
  selected: string,
  tone: "critical" | "warning" | "ok",
): string {
  const selectedClasses = selected
    ? "bg-[#6366F1]/16"
    : "hover:bg-[#6366F1]/10";
  const toneClasses =
    tone === "critical" ? "border-l-2 border-l-[#EF4444]/70" : "";

  return `cursor-pointer border-b border-white/10 transition ${selectedClasses} ${toneClasses}`;
}

function severityBadgeClasses(severity: Severity): string {
  const base =
    "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold leading-none";

  if (severity === "critical") {
    return `${base} border-[#EF4444]/40 bg-[#EF4444]/12 text-[#EF4444]`;
  }

  if (severity === "high") {
    return `${base} border-[#F59E0B]/40 bg-[#F59E0B]/14 text-[#F59E0B]`;
  }

  if (severity === "medium") {
    return `${base} border-[#F59E0B]/32 bg-[#F59E0B]/10 text-[#FBBF24]`;
  }

  return `${base} border-white/15 bg-white/5 text-[#CBD5E1]`;
}

function statusBadgeClasses(tone: "critical" | "warning" | "ok"): string {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold leading-none before:inline-block before:h-1.5 before:w-1.5 before:rounded-full before:bg-current";

  if (tone === "critical") {
    return `${base} border-[#EF4444]/40 bg-[#EF4444]/12 text-[#EF4444]`;
  }

  if (tone === "warning") {
    return `${base} border-[#F59E0B]/40 bg-[#F59E0B]/12 text-[#F59E0B]`;
  }

  return `${base} border-[#22C55E]/35 bg-[#22C55E]/10 text-[#22C55E]`;
}

function findingHealthTone(finding: Finding): "critical" | "warning" | "ok" {
  if (finding.severity === "critical" || finding.severity === "high") {
    return "critical";
  }

  if (finding.severity === "medium") {
    return "warning";
  }

  return "ok";
}

function resolveSyncTone(
  status: PersistedScanJob["status"] | undefined,
  hasError: boolean,
): "critical" | "warning" | "ok" {
  if (hasError || status === "failed") {
    return "critical";
  }

  if (status === "processing" || status === "pending") {
    return "warning";
  }

  return "ok";
}

function formatTimestamp(value: string, language: DashboardLanguage): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(language, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    return value;
  }
}

function renderDiffViewer(
  finding: Finding | undefined,
  visualCopy: DashboardVisualCopy,
): string {
  if (!finding) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(visualCopy.noDiffContext)}</p>`;
  }

  const relatedPath = finding.relatedFile ?? "docs/contract.md";
  const lines: Array<{
    tone: "ctx" | "add" | "del";
    text: string;
  }> = [
    {
      tone: "ctx",
      text: `@@ ${relatedPath} -> ${finding.file} @@`,
    },
    {
      tone: "del",
      text: `- ${relatedPath}: ${finding.evidence}`,
    },
    {
      tone: "add",
      text: `+ ${finding.file}: ${finding.userMessage}`,
    },
  ];

  return `
    <pre class="m-0 max-h-[320px] overflow-auto rounded-xl border border-white/10 border-t-2 border-t-[#6366F1]/45 bg-[#0F172A] p-3 font-mono text-xs leading-6 text-[#DBE3EF]">${lines
      .map(
        (line) =>
          `<span class="block rounded px-0.5 ${diffLineClasses(line.tone)}">${escapeHtml(line.text)}</span>`,
      )
      .join("")}</pre>
  `;
}

function renderFindingCodeBlock(
  finding: Finding | undefined,
  visualCopy: DashboardVisualCopy,
): string {
  if (!finding) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(visualCopy.noCodeContext)}</p>`;
  }

  const payload = {
    id: finding.id,
    fingerprint: finding.fingerprint,
    type: finding.type,
    severity: finding.severity,
    score: finding.score,
    publishable: finding.publishable,
    file: finding.file,
    relatedFile: finding.relatedFile,
    relatedArtifacts: finding.relatedArtifacts,
  };

  return `<pre class="m-0 max-h-[320px] overflow-auto rounded-xl border border-white/10 border-t-2 border-t-[#6366F1]/30 bg-[#0F172A] p-3 font-mono text-xs leading-6 text-[#DBE3EF]">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
}

function renderServiceGraph(report: PersistedFindingsReport | null): string {
  if (!report) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(getVisualCopy(state.language).noGraphContext)}</p>`;
  }

  const counts = report.summary.findingCounts;

  return `
    <div class="relative mt-1 h-[252px] overflow-hidden rounded-xl border border-white/10 bg-[#0F172A] [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,_transparent_1px),linear-gradient(90deg,_rgba(148,163,184,0.08)_1px,_transparent_1px)] [background-size:36px_36px]">
      <span class="absolute left-1/2 top-[54px] h-[1.5px] w-[34%] origin-left rotate-[40deg] bg-slate-400/40"></span>
      <span class="absolute left-[47%] top-[58px] h-[1.5px] w-[35%] origin-left rotate-[154deg] bg-slate-400/40"></span>
      <span class="absolute left-[58%] top-[126px] h-[1.5px] w-[22%] origin-left rotate-[118deg] bg-slate-400/40"></span>
      <span class="absolute left-[41%] top-[126px] h-[1.5px] w-[23%] origin-left rotate-[64deg] bg-slate-400/40"></span>
      ${renderGraphNode("API", counts.api_contract_drift, "api")}
      ${renderGraphNode("Docs", counts.documentation_drift, "docs")}
      ${renderGraphNode("Config", counts.config_drift, "config")}
      ${renderGraphNode("Tests", counts.test_drift, "tests")}
      ${renderGraphNode("Comments", counts.comment_drift, "comments")}
    </div>
  `;
}

function renderGraphNode(
  label: string,
  count: number,
  position: "api" | "docs" | "config" | "tests" | "comments",
): string {
  const positionClasses: Record<typeof position, string> = {
    api: "left-1/2 top-4 -translate-x-1/2",
    docs: "left-3 top-24",
    config: "right-3 top-24",
    tests: "bottom-3 left-[23%]",
    comments: "bottom-3 right-[18%]",
  };
  const toneClasses =
    count > 0
      ? "border-[#EF4444]/45 bg-[#EF4444]/12"
      : "border-[#6366F1]/40 bg-[#6366F1]/12";

  return `
    <div class="absolute min-w-[94px] rounded-[10px] border px-3 py-2 text-center text-xs text-[#E5E7EB] transition hover:-translate-y-px hover:border-white/20 ${positionClasses[position]} ${toneClasses}">
      <strong class="mb-1 block text-[10px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(label)}</strong>
      <span class="text-sm font-semibold">${count}</span>
    </div>
  `;
}

function renderScoreMeter(
  label: keyof DashboardMessages["scoreLabels"],
  score: number,
  messages: DashboardMessages,
  threshold?: number,
): string {
  const pct = Math.round(score * 100);
  const thresholdLabel =
    typeof threshold === "number"
      ? ` • ${messages.threshold} ${threshold.toFixed(2)}`
      : "";

  return `
    <div class="mt-2">
      <span class="text-[11px] font-mono text-[#CBD5E1]">${escapeHtml(messages.scoreLabels[label])} ${score.toFixed(2)}${escapeHtml(thresholdLabel)}</span>
      <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-500/25">
        <div class="h-full rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] w-[${pct}%]"></div>
      </div>
    </div>
  `;
}

function diffLineClasses(tone: "ctx" | "add" | "del"): string {
  if (tone === "add") {
    return "bg-[#22C55E]/16 text-[#8DF2B2]";
  }

  if (tone === "del") {
    return "bg-[#EF4444]/16 text-[#FCA5A5]";
  }

  return "text-[#B3C0D1]";
}

function bindEvents(): void {
  const languageSelect =
    document.querySelector<HTMLSelectElement>("#language-select");
  const severitySelect =
    document.querySelector<HTMLSelectElement>("#filter-severity");
  const typeSelect = document.querySelector<HTMLSelectElement>("#filter-type");
  const searchInput =
    document.querySelector<HTMLInputElement>("#filter-search");
  const publishableInput = document.querySelector<HTMLInputElement>(
    "#filter-publishable",
  );
  const refreshButton =
    document.querySelector<HTMLButtonElement>("#refresh-feed");

  languageSelect?.addEventListener("change", () => {
    const nextLanguage = languageSelect.value;

    if (!isDashboardLanguage(nextLanguage)) {
      return;
    }

    state.language = nextLanguage;
    persistLanguage(nextLanguage);
    applyDocumentLanguage(nextLanguage);
    render();
  });

  severitySelect?.addEventListener("change", () => {
    state.filters.severity = severitySelect.value as Filters["severity"];
    ensureSelectedFinding();
    render();
  });

  typeSelect?.addEventListener("change", () => {
    state.filters.type = typeSelect.value as Filters["type"];
    ensureSelectedFinding();
    render();
  });

  searchInput?.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    ensureSelectedFinding();
    render();
  });

  publishableInput?.addEventListener("change", () => {
    state.filters.publishableOnly = publishableInput.checked;
    ensureSelectedFinding();
    render();
  });

  refreshButton?.addEventListener("click", () => {
    state.reportCache.clear();
    void loadFeed();
  });

  document
    .querySelectorAll<HTMLButtonElement>("[data-report-id]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const reportId = button.dataset.reportId;

        if (!reportId || reportId === state.selectedJobId) {
          return;
        }

        state.selectedJobId = reportId;
        state.selectedFindingId = null;
        void loadReport(reportId);
      });
    });

  document
    .querySelectorAll<HTMLElement>("[data-finding-id]")
    .forEach((item) => {
      const selectFinding = (): void => {
        const findingId = item.dataset.findingId;

        if (!findingId) {
          return;
        }

        state.selectedFindingId = findingId;
        render();
      };

      item.addEventListener("click", selectFinding);
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectFinding();
        }
      });
    });
}

function severityLabel(
  severity: Severity,
  messages: DashboardMessages,
): string {
  return messages.severityLabels[severity];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLanguageOptions(selected: DashboardLanguage): string {
  return LANGUAGE_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option.code)}" ${
        option.code === selected ? "selected" : ""
      }>${escapeHtml(option.label)}</option>`,
  ).join("");
}

function renderSeverityOptions(
  selected: Filters["severity"],
  messages: DashboardMessages,
): string {
  return [
    {
      value: "all",
      label: messages.allLabel,
    },
    {
      value: "critical",
      label: messages.severityLabels.critical,
    },
    {
      value: "high",
      label: messages.severityLabels.high,
    },
    {
      value: "medium",
      label: messages.severityLabels.medium,
    },
    {
      value: "low",
      label: messages.severityLabels.low,
    },
  ]
    .map(
      (item) =>
        `<option value="${escapeHtml(item.value)}" ${
          item.value === selected ? "selected" : ""
        }>${escapeHtml(item.label)}</option>`,
    )
    .join("");
}

function renderTypeOptions(
  selected: Filters["type"],
  messages: DashboardMessages,
): string {
  return [
    {
      value: "all",
      label: messages.allLabel,
    },
    {
      value: "api_contract_drift",
      label: messages.typeLabels.api_contract_drift,
    },
    {
      value: "documentation_drift",
      label: messages.typeLabels.documentation_drift,
    },
    {
      value: "comment_drift",
      label: messages.typeLabels.comment_drift,
    },
    {
      value: "config_drift",
      label: messages.typeLabels.config_drift,
    },
    {
      value: "test_drift",
      label: messages.typeLabels.test_drift,
    },
  ]
    .map(
      (item) =>
        `<option value="${escapeHtml(item.value)}" ${
          item.value === selected ? "selected" : ""
        }>${escapeHtml(item.label)}</option>`,
    )
    .join("");
}
