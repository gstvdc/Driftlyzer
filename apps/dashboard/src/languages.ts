export type DashboardLanguage = "pt-BR" | "en" | "es" | "fr";

export type DashboardLanguageOption = {
  code: DashboardLanguage;
  label: string;
};

export type DashboardMessages = {
  missionControl: string;
  title: string;
  subtitle: string;
  language: string;
  reports: string;
  findings: string;
  publishable: string;
  peakRisk: string;
  severity: string;
  type: string;
  search: string;
  searchPlaceholder: string;
  publishableOnly: string;
  refresh: string;
  details: string;
  loadingData: string;
  ready: string;
  noFeed: string;
  fetchingReports: string;
  noFindingsForFilters: string;
  selectReport: string;
  loadingReport: string;
  chooseFinding: string;
  id: string;
  fingerprint: string;
  rule: string;
  schema: string;
  scope: string;
  scoreBreakdown: string;
  paths: string;
  primary: string;
  related: string;
  artifacts: string;
  suggestedFix: string;
  noSuggestion: string;
  semanticAssist: string;
  noSemanticReview: string;
  publishableYes: string;
  publishableNo: string;
  threshold: string;
  changed: string;
  depth: string;
  reportLocalLabel: string;
  reportPublishedShort: string;
  reportNotFoundPrefix: string;
  reportLoadErrorPrefix: string;
  feedLoadErrorPrefix: string;
  statusLabels: Record<
    "pending" | "processing" | "completed" | "failed",
    string
  >;
  severityLabels: Record<"critical" | "high" | "medium" | "low", string>;
  typeLabels: Record<
    | "api_contract_drift"
    | "documentation_drift"
    | "comment_drift"
    | "config_drift"
    | "test_drift",
    string
  >;
  analysisModeLabels: Record<"full" | "diff", string>;
  scoreLabels: Record<
    "structural" | "semantic" | "diff" | "history" | "final",
    string
  >;
  allLabel: string;
};

export const LANGUAGE_OPTIONS: DashboardLanguageOption[] = [
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
];

export const DEFAULT_LANGUAGE: DashboardLanguage = "pt-BR";

const COMMON_TYPE_LABELS = {
  api_contract_drift: "API Contract Drift",
  documentation_drift: "Documentation Drift",
  comment_drift: "Comment Drift",
  config_drift: "Config Drift",
  test_drift: "Test Drift",
} as const;

export const DASHBOARD_MESSAGES: Record<DashboardLanguage, DashboardMessages> =
  {
    "pt-BR": {
      missionControl: "Visão do repositório",
      title: "Painel de consistência",
      subtitle:
        "Acompanhe divergências entre código, contratos, configuração e documentação a partir dos scans mais recentes.",
      language: "Idioma",
      reports: "Relatórios",
      findings: "Achados",
      publishable: "Publicáveis",
      peakRisk: "Risco Máximo",
      severity: "Severidade",
      type: "Tipo",
      search: "Busca",
      searchPlaceholder: "id, caminho, evidência",
      publishableOnly: "Somente publicáveis",
      refresh: "Atualizar",
      details: "Detalhes",
      loadingData: "Carregando dados...",
      ready: "Pronto.",
      noFeed:
        "Ainda não há relatórios. Rode o worker para gerar saídas de scan.",
      fetchingReports: "Buscando relatórios...",
      noFindingsForFilters: "Nenhum achado para os filtros atuais.",
      selectReport: "Selecione um relatório para inspecionar os achados.",
      loadingReport: "Carregando detalhes do relatório...",
      chooseFinding:
        "Escolha um achado para inspecionar os campos estáveis do contrato e os componentes de score.",
      id: "ID",
      fingerprint: "Fingerprint",
      rule: "Regra",
      schema: "Schema",
      scope: "Escopo",
      scoreBreakdown: "Quebra de Score",
      paths: "Caminhos",
      primary: "Primário",
      related: "Relacionado",
      artifacts: "Artefatos",
      suggestedFix: "Sugestão de Correção",
      noSuggestion: "Nenhuma sugestão disponível.",
      semanticAssist: "Assistência Semântica",
      noSemanticReview: "Sem revisão semântica anexada.",
      publishableYes: "sim",
      publishableNo: "não",
      threshold: "limiar",
      changed: "alterados",
      depth: "profundidade",
      reportLocalLabel: "local",
      reportPublishedShort: "pub",
      reportNotFoundPrefix: "Relatório não encontrado para o job",
      reportLoadErrorPrefix: "Não foi possível carregar o relatório",
      feedLoadErrorPrefix: "Não foi possível carregar os relatórios",
      statusLabels: {
        pending: "pendente",
        processing: "processando",
        completed: "concluído",
        failed: "falhou",
      },
      severityLabels: {
        critical: "Crítica",
        high: "Alta",
        medium: "Média",
        low: "Baixa",
      },
      typeLabels: {
        api_contract_drift: "Drift de Contrato de API",
        documentation_drift: "Drift de Documentação",
        comment_drift: "Drift de Comentário",
        config_drift: "Drift de Configuração",
        test_drift: "Drift de Testes",
      },
      analysisModeLabels: {
        full: "completo",
        diff: "diff",
      },
      scoreLabels: {
        structural: "estrutural",
        semantic: "semântico",
        diff: "diff",
        history: "histórico",
        final: "final",
      },
      allLabel: "todos",
    },
    en: {
      missionControl: "Repository View",
      title: "Consistency Dashboard",
      subtitle:
        "Track drift across code, contracts, configuration, and documentation from the latest scans.",
      language: "Language",
      reports: "Reports",
      findings: "Findings",
      publishable: "Publishable",
      peakRisk: "Peak Risk",
      severity: "Severity",
      type: "Type",
      search: "Search",
      searchPlaceholder: "id, path, evidence",
      publishableOnly: "Publishable only",
      refresh: "Refresh",
      details: "Details",
      loadingData: "Loading data...",
      ready: "Ready.",
      noFeed: "No reports yet. Run the worker to generate scan outputs.",
      fetchingReports: "Fetching reports...",
      noFindingsForFilters: "No findings with the active filters.",
      selectReport: "Select a report to inspect findings.",
      loadingReport: "Loading report details...",
      chooseFinding:
        "Choose a finding to inspect stable contract fields and score components.",
      id: "ID",
      fingerprint: "Fingerprint",
      rule: "Rule",
      schema: "Schema",
      scope: "Scope",
      scoreBreakdown: "Score Breakdown",
      paths: "Paths",
      primary: "Primary",
      related: "Related",
      artifacts: "Artifacts",
      suggestedFix: "Suggested Fix",
      noSuggestion: "No suggestion available.",
      semanticAssist: "Semantic Assist",
      noSemanticReview: "No semantic review attached.",
      publishableYes: "yes",
      publishableNo: "no",
      threshold: "threshold",
      changed: "changed",
      depth: "depth",
      reportLocalLabel: "local",
      reportPublishedShort: "pub",
      reportNotFoundPrefix: "Report not found for job",
      reportLoadErrorPrefix: "Could not load report",
      feedLoadErrorPrefix: "Could not load reports",
      statusLabels: {
        pending: "pending",
        processing: "processing",
        completed: "completed",
        failed: "failed",
      },
      severityLabels: {
        critical: "Critical",
        high: "High",
        medium: "Medium",
        low: "Low",
      },
      typeLabels: { ...COMMON_TYPE_LABELS },
      analysisModeLabels: {
        full: "full",
        diff: "diff",
      },
      scoreLabels: {
        structural: "structural",
        semantic: "semantic",
        diff: "diff",
        history: "history",
        final: "final",
      },
      allLabel: "all",
    },
    es: {
      missionControl: "Vista del repositorio",
      title: "Panel de consistencia",
      subtitle:
        "Sigue divergencias entre código, contratos, configuración y documentación a partir de los análisis más recientes.",
      language: "Idioma",
      reports: "Reportes",
      findings: "Hallazgos",
      publishable: "Publicables",
      peakRisk: "Riesgo Máximo",
      severity: "Severidad",
      type: "Tipo",
      search: "Búsqueda",
      searchPlaceholder: "id, ruta, evidencia",
      publishableOnly: "Solo publicables",
      refresh: "Actualizar",
      details: "Detalles",
      loadingData: "Cargando datos...",
      ready: "Listo.",
      noFeed:
        "Aún no hay reportes. Ejecuta el worker para generar salidas de scan.",
      fetchingReports: "Buscando reportes...",
      noFindingsForFilters: "No hay hallazgos con los filtros activos.",
      selectReport: "Selecciona un reporte para inspeccionar hallazgos.",
      loadingReport: "Cargando detalles del reporte...",
      chooseFinding:
        "Elige un hallazgo para inspeccionar los campos estables del contrato y los componentes de score.",
      id: "ID",
      fingerprint: "Fingerprint",
      rule: "Regla",
      schema: "Schema",
      scope: "Alcance",
      scoreBreakdown: "Desglose del Score",
      paths: "Rutas",
      primary: "Principal",
      related: "Relacionado",
      artifacts: "Artefactos",
      suggestedFix: "Sugerencia de Corrección",
      noSuggestion: "No hay sugerencia disponible.",
      semanticAssist: "Asistencia Semántica",
      noSemanticReview: "Sin revisión semántica adjunta.",
      publishableYes: "sí",
      publishableNo: "no",
      threshold: "umbral",
      changed: "cambiados",
      depth: "profundidad",
      reportLocalLabel: "local",
      reportPublishedShort: "pub",
      reportNotFoundPrefix: "Reporte no encontrado para el job",
      reportLoadErrorPrefix: "No fue posible cargar el reporte",
      feedLoadErrorPrefix: "No fue posible cargar los reportes",
      statusLabels: {
        pending: "pendiente",
        processing: "procesando",
        completed: "completado",
        failed: "falló",
      },
      severityLabels: {
        critical: "Crítica",
        high: "Alta",
        medium: "Media",
        low: "Baja",
      },
      typeLabels: {
        api_contract_drift: "Drift de Contrato API",
        documentation_drift: "Drift de Documentación",
        comment_drift: "Drift de Comentario",
        config_drift: "Drift de Configuración",
        test_drift: "Drift de Pruebas",
      },
      analysisModeLabels: {
        full: "completo",
        diff: "diff",
      },
      scoreLabels: {
        structural: "estructural",
        semantic: "semántico",
        diff: "diff",
        history: "histórico",
        final: "final",
      },
      allLabel: "todos",
    },
    fr: {
      missionControl: "Vue du dépôt",
      title: "Tableau de cohérence",
      subtitle:
        "Suivez les écarts entre code, contrats, configuration et documentation à partir des analyses récentes.",
      language: "Langue",
      reports: "Rapports",
      findings: "Constats",
      publishable: "Publiables",
      peakRisk: "Risque Max",
      severity: "Sévérité",
      type: "Type",
      search: "Recherche",
      searchPlaceholder: "id, chemin, preuve",
      publishableOnly: "Seulement publiables",
      refresh: "Actualiser",
      details: "Détails",
      loadingData: "Chargement des données...",
      ready: "Prêt.",
      noFeed:
        "Aucun rapport pour le moment. Exécutez le worker pour générer des scans.",
      fetchingReports: "Récupération des rapports...",
      noFindingsForFilters: "Aucun constat avec les filtres actifs.",
      selectReport: "Sélectionnez un rapport pour inspecter les constats.",
      loadingReport: "Chargement des détails du rapport...",
      chooseFinding:
        "Choisissez un constat pour inspecter les champs stables du contrat et le score.",
      id: "ID",
      fingerprint: "Fingerprint",
      rule: "Règle",
      schema: "Schéma",
      scope: "Portée",
      scoreBreakdown: "Détail du Score",
      paths: "Chemins",
      primary: "Principal",
      related: "Associé",
      artifacts: "Artefacts",
      suggestedFix: "Correction Suggérée",
      noSuggestion: "Aucune suggestion disponible.",
      semanticAssist: "Aide Sémantique",
      noSemanticReview: "Aucune revue sémantique associée.",
      publishableYes: "oui",
      publishableNo: "non",
      threshold: "seuil",
      changed: "modifiés",
      depth: "profondeur",
      reportLocalLabel: "local",
      reportPublishedShort: "pub",
      reportNotFoundPrefix: "Rapport introuvable pour le job",
      reportLoadErrorPrefix: "Impossible de charger le rapport",
      feedLoadErrorPrefix: "Impossible de charger les rapports",
      statusLabels: {
        pending: "en attente",
        processing: "en traitement",
        completed: "terminé",
        failed: "échoué",
      },
      severityLabels: {
        critical: "Critique",
        high: "Haute",
        medium: "Moyenne",
        low: "Basse",
      },
      typeLabels: { ...COMMON_TYPE_LABELS },
      analysisModeLabels: {
        full: "complet",
        diff: "diff",
      },
      scoreLabels: {
        structural: "structurel",
        semantic: "sémantique",
        diff: "diff",
        history: "historique",
        final: "final",
      },
      allLabel: "tous",
    },
  };

export function getDashboardMessages(
  language: DashboardLanguage,
): DashboardMessages {
  return DASHBOARD_MESSAGES[language] ?? DASHBOARD_MESSAGES[DEFAULT_LANGUAGE];
}
