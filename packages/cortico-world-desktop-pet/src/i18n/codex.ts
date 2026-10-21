/** Codex monitor text for the account card, progress bubbles and config schema. */
import type { Language } from 'cortico/core/language.ts';

const en = {
  group: 'Codex monitoring', enabled: 'Monitor Codex', enabledHelp: 'Read local task progress, token usage and account limits.',
  home: 'Codex data directory', homeHelp: 'Empty uses CODEX_HOME, then .codex in the user home directory.',
  executable: 'Codex executable', executableHelp: 'Empty discovers the installed Codex app or CLI. Used to read account limits through app-server.',
  refresh: 'Account refresh interval', refreshHelp: 'Seconds between account-limit requests; at least 300 seconds (5 minutes).', seconds: 's',
  title: 'Codex account', today: 'Local today: {0} tokens', local: 'Local total: {0} tokens',
  quota: '{0}: {1}% used · {2}% remaining', window: '{0}-minute window', reset: 'Resets: {0}', updated: 'Updated: {0}',
  stale: 'Account data is stale', missing: 'Account limits unavailable', failed: 'Account refresh failed: {0}',
  coverage: 'Local sessions only; excludes other devices and unrecorded usage.', disabled: 'Codex monitoring is off', refreshButton: 'Refresh',
  plan: 'Plan: {0}', credits: 'Credits: {0}', sourceLocal: 'Source: local session logs', sourceAccount: 'Source: Codex account',
  completed: 'Codex · {0}: turn completed', taskFailed: 'Codex · {0}: task failed', interrupted: 'Codex · {0}: task interrupted',
  planProgress: 'Codex · {0}: plan {1}/{2} · {3}', todo: 'Codex · {0}: todo {1}/{2} · {3}',
  goal: 'Codex · {0}: goal {1}', subagent: 'Codex · {0}: subagent {1}', more: '{0} more updates',
  blocked: 'Codex · {0}: task blocked', approval: 'Codex · {0}: waiting for approval', quotaLow: 'Codex · {0}: {1}% remaining',
};
type Copy = Record<keyof typeof en, string>;
const copies: Record<Language, Copy> = {
  en,
  zh: {
    group: 'Codex 监控', enabled: '监控 Codex', enabledHelp: '读取本地任务进度、token 用量和账户额度。',
    home: 'Codex 数据目录', homeHelp: '留空使用 CODEX_HOME，再使用用户主目录下的 .codex。',
    executable: 'Codex 可执行文件', executableHelp: '留空查找已安装的 Codex 应用或命令行程序，通过 app-server 读取账户额度。',
    refresh: '账户刷新间隔', refreshHelp: '两次账户额度请求之间的秒数，至少 300 秒（5 分钟）。', seconds: '秒',
    title: 'Codex 账户', today: '本机今日：{0} token', local: '本地累计：{0} token', quota: '{0}：已用 {1}% · 剩余 {2}%',
    window: '{0} 分钟窗口', reset: '重置时间：{0}', updated: '更新时间：{0}', stale: '账户数据已过期', missing: '账户额度暂不可用',
    failed: '账户刷新失败：{0}', coverage: '仅统计本地会话，不含其他设备和未记录的用量。', disabled: 'Codex 监控已关闭', refreshButton: '刷新',
    plan: '套餐：{0}', credits: '点数：{0}', sourceLocal: '来源：本地会话日志', sourceAccount: '来源：Codex 账户',
    completed: 'Codex · {0}：本轮已完成', taskFailed: 'Codex · {0}：任务失败', interrupted: 'Codex · {0}：任务已中断',
    planProgress: 'Codex · {0}：计划 {1}/{2} · {3}', todo: 'Codex · {0}：待办 {1}/{2} · {3}', goal: 'Codex · {0}：目标 {1}',
    subagent: 'Codex · {0}：子代理 {1}', more: '另有 {0} 项更新', blocked: 'Codex · {0}：任务受阻', approval: 'Codex · {0}：等待批准', quotaLow: 'Codex · {0}：额度剩余 {1}%',
  },
  'zh-Hant': {
    group: 'Codex 監控', enabled: '監控 Codex', enabledHelp: '讀取本機任務進度、token 用量和帳戶額度。',
    home: 'Codex 資料目錄', homeHelp: '留空使用 CODEX_HOME，再使用使用者主目錄下的 .codex。',
    executable: 'Codex 執行檔', executableHelp: '留空尋找已安裝的 Codex 應用程式或命令列程式，透過 app-server 讀取帳戶額度。',
    refresh: '帳戶重新整理間隔', refreshHelp: '兩次帳戶額度請求之間的秒數，至少 300 秒（5 分鐘）。', seconds: '秒',
    title: 'Codex 帳戶', today: '本機今日：{0} token', local: '本機累計：{0} token', quota: '{0}：已用 {1}% · 剩餘 {2}%',
    window: '{0} 分鐘視窗', reset: '重設時間：{0}', updated: '更新時間：{0}', stale: '帳戶資料已過期', missing: '帳戶額度暫時無法取得',
    failed: '帳戶重新整理失敗：{0}', coverage: '僅統計本機對話，不含其他裝置和未記錄的用量。', disabled: 'Codex 監控已關閉', refreshButton: '重新整理',
    plan: '方案：{0}', credits: '點數：{0}', sourceLocal: '來源：本機對話日誌', sourceAccount: '來源：Codex 帳戶',
    completed: 'Codex · {0}：本輪已完成', taskFailed: 'Codex · {0}：任務失敗', interrupted: 'Codex · {0}：任務已中斷',
    planProgress: 'Codex · {0}：計畫 {1}/{2} · {3}', todo: 'Codex · {0}：待辦 {1}/{2} · {3}', goal: 'Codex · {0}：目標 {1}',
    subagent: 'Codex · {0}：子代理 {1}', more: '另有 {0} 項更新', blocked: 'Codex · {0}：任務受阻', approval: 'Codex · {0}：等待核准', quotaLow: 'Codex · {0}：額度剩餘 {1}%',
  },
  ja: {
    group: 'Codex の監視', enabled: 'Codex を監視', enabledHelp: 'ローカルのタスク進捗、トークン使用量、アカウント上限を読み取ります。',
    home: 'Codex データフォルダー', homeHelp: '空欄の場合は CODEX_HOME、次にホーム内の .codex を使用します。',
    executable: 'Codex 実行ファイル', executableHelp: '空欄の場合はインストール済みの Codex アプリまたは CLI を検索し、app-server で上限を取得します。',
    refresh: 'アカウント更新間隔', refreshHelp: 'アカウント上限の取得間隔。最短 300 秒（5 分）。', seconds: '秒',
    title: 'Codex アカウント', today: '本機の本日：{0} トークン', local: 'ローカル累計：{0} トークン', quota: '{0}：使用済み {1}% · 残り {2}%',
    window: '{0} 分間の枠', reset: 'リセット：{0}', updated: '更新：{0}', stale: 'アカウント情報が古くなっています', missing: 'アカウント上限を取得できません',
    failed: 'アカウント更新失敗：{0}', coverage: 'ローカルの会話のみ。他の端末と未記録の使用量は含みません。', disabled: 'Codex の監視はオフです', refreshButton: '更新',
    plan: 'プラン：{0}', credits: 'クレジット：{0}', sourceLocal: '取得元：ローカル会話ログ', sourceAccount: '取得元：Codex アカウント',
    completed: 'Codex · {0}：ターン完了', taskFailed: 'Codex · {0}：タスク失敗', interrupted: 'Codex · {0}：タスク中断',
    planProgress: 'Codex · {0}：計画 {1}/{2} · {3}', todo: 'Codex · {0}：作業 {1}/{2} · {3}', goal: 'Codex · {0}：目標 {1}',
    subagent: 'Codex · {0}：サブエージェント {1}', more: 'ほか {0} 件の更新', blocked: 'Codex · {0}：タスクが進行できません', approval: 'Codex · {0}：承認待ち', quotaLow: 'Codex · {0}：残り {1}%',
  },
  ko: {
    group: 'Codex 모니터링', enabled: 'Codex 모니터링', enabledHelp: '로컬 작업 진행 상황, 토큰 사용량 및 계정 한도를 읽습니다.',
    home: 'Codex 데이터 폴더', homeHelp: '비워 두면 CODEX_HOME, 이후 사용자 홈의 .codex를 사용합니다.',
    executable: 'Codex 실행 파일', executableHelp: '비워 두면 설치된 Codex 앱 또는 CLI를 찾아 app-server로 계정 한도를 읽습니다.',
    refresh: '계정 새로 고침 간격', refreshHelp: '계정 한도 요청 간격입니다. 최소 300초(5분)입니다.', seconds: '초',
    title: 'Codex 계정', today: '로컬 오늘: {0} 토큰', local: '로컬 누적: {0} 토큰', quota: '{0}: 사용 {1}% · 남음 {2}%',
    window: '{0}분 한도', reset: '초기화: {0}', updated: '업데이트: {0}', stale: '계정 데이터가 오래되었습니다', missing: '계정 한도를 사용할 수 없습니다',
    failed: '계정 새로 고침 실패: {0}', coverage: '로컬 대화만 집계하며 다른 기기 및 기록되지 않은 사용량은 제외합니다.', disabled: 'Codex 모니터링이 꺼져 있습니다', refreshButton: '새로 고침',
    plan: '요금제: {0}', credits: '크레딧: {0}', sourceLocal: '출처: 로컬 대화 로그', sourceAccount: '출처: Codex 계정',
    completed: 'Codex · {0}: 이번 턴 완료', taskFailed: 'Codex · {0}: 작업 실패', interrupted: 'Codex · {0}: 작업 중단',
    planProgress: 'Codex · {0}: 계획 {1}/{2} · {3}', todo: 'Codex · {0}: 할 일 {1}/{2} · {3}', goal: 'Codex · {0}: 목표 {1}',
    subagent: 'Codex · {0}: 하위 에이전트 {1}', more: '업데이트 {0}개 더 있음', blocked: 'Codex · {0}: 작업 차단됨', approval: 'Codex · {0}: 승인 대기 중', quotaLow: 'Codex · {0}: {1}% 남음',
  },
  fr: {
    group: 'Suivi de Codex', enabled: 'Surveiller Codex', enabledHelp: 'Lire la progression locale, les jetons utilisés et les limites du compte.',
    home: 'Dossier de données Codex', homeHelp: 'Vide : utiliser CODEX_HOME, puis .codex dans le dossier personnel.',
    executable: 'Exécutable Codex', executableHelp: 'Vide : rechercher l’application ou la CLI Codex installée ; lire les limites via app-server.',
    refresh: 'Intervalle du compte', refreshHelp: 'Secondes entre les demandes de limites ; au moins 300 secondes (5 minutes).', seconds: 's',
    title: 'Compte Codex', today: 'Local aujourd’hui : {0} jetons', local: 'Total local : {0} jetons', quota: '{0} : {1}% utilisés · {2}% restants',
    window: 'Fenêtre de {0} minutes', reset: 'Réinitialisation : {0}', updated: 'Mise à jour : {0}', stale: 'Données du compte anciennes', missing: 'Limites du compte indisponibles',
    failed: 'Échec de l’actualisation : {0}', coverage: 'Sessions locales uniquement ; autres appareils et usages non enregistrés exclus.', disabled: 'Suivi de Codex désactivé', refreshButton: 'Actualiser',
    plan: 'Forfait : {0}', credits: 'Crédits : {0}', sourceLocal: 'Source : journaux des sessions locales', sourceAccount: 'Source : compte Codex',
    completed: 'Codex · {0} : tour terminé', taskFailed: 'Codex · {0} : échec de la tâche', interrupted: 'Codex · {0} : tâche interrompue',
    planProgress: 'Codex · {0} : plan {1}/{2} · {3}', todo: 'Codex · {0} : tâches {1}/{2} · {3}', goal: 'Codex · {0} : objectif {1}',
    subagent: 'Codex · {0} : sous-agent {1}', more: '{0} autres mises à jour', blocked: 'Codex · {0} : tâche bloquée', approval: 'Codex · {0} : en attente d’approbation', quotaLow: 'Codex · {0} : {1}% restants',
  },
  de: {
    group: 'Codex-Überwachung', enabled: 'Codex überwachen', enabledHelp: 'Lokalen Aufgabenfortschritt, Tokenverbrauch und Kontolimits lesen.',
    home: 'Codex-Datenordner', homeHelp: 'Leer: CODEX_HOME, danach .codex im Benutzerordner verwenden.',
    executable: 'Codex-Programmdatei', executableHelp: 'Leer: installierte Codex-App oder CLI suchen und Kontolimits über app-server lesen.',
    refresh: 'Konto-Aktualisierungsintervall', refreshHelp: 'Sekunden zwischen Limitabfragen; mindestens 300 Sekunden (5 Minuten).', seconds: 's',
    title: 'Codex-Konto', today: 'Lokal heute: {0} Token', local: 'Lokal insgesamt: {0} Token', quota: '{0}: {1}% verbraucht · {2}% übrig',
    window: '{0}-Minuten-Fenster', reset: 'Zurücksetzung: {0}', updated: 'Aktualisiert: {0}', stale: 'Kontodaten sind veraltet', missing: 'Kontolimits nicht verfügbar',
    failed: 'Kontoaktualisierung fehlgeschlagen: {0}', coverage: 'Nur lokale Sitzungen; andere Geräte und nicht erfasste Nutzung fehlen.', disabled: 'Codex-Überwachung ausgeschaltet', refreshButton: 'Aktualisieren',
    plan: 'Tarif: {0}', credits: 'Guthaben: {0}', sourceLocal: 'Quelle: lokale Sitzungsprotokolle', sourceAccount: 'Quelle: Codex-Konto',
    completed: 'Codex · {0}: Runde abgeschlossen', taskFailed: 'Codex · {0}: Aufgabe fehlgeschlagen', interrupted: 'Codex · {0}: Aufgabe unterbrochen',
    planProgress: 'Codex · {0}: Plan {1}/{2} · {3}', todo: 'Codex · {0}: Aufgaben {1}/{2} · {3}', goal: 'Codex · {0}: Ziel {1}',
    subagent: 'Codex · {0}: Unteragent {1}', more: '{0} weitere Meldungen', blocked: 'Codex · {0}: Aufgabe blockiert', approval: 'Codex · {0}: wartet auf Genehmigung', quotaLow: 'Codex · {0}: {1}% übrig',
  },
  'es-419': {
    group: 'Monitoreo de Codex', enabled: 'Monitorear Codex', enabledHelp: 'Leer el progreso local, el uso de tokens y los límites de la cuenta.',
    home: 'Carpeta de datos de Codex', homeHelp: 'Vacío: usar CODEX_HOME y luego .codex en la carpeta personal.',
    executable: 'Ejecutable de Codex', executableHelp: 'Vacío: buscar la app o CLI de Codex instalada y leer límites mediante app-server.',
    refresh: 'Intervalo de actualización de la cuenta', refreshHelp: 'Segundos entre solicitudes de límites; mínimo 300 segundos (5 minutos).', seconds: 's',
    title: 'Cuenta de Codex', today: 'Hoy local: {0} tokens', local: 'Total local: {0} tokens', quota: '{0}: {1}% usado · {2}% restante',
    window: 'Ventana de {0} minutos', reset: 'Se restablece: {0}', updated: 'Actualizado: {0}', stale: 'Los datos de la cuenta están desactualizados', missing: 'Límites de la cuenta no disponibles',
    failed: 'Error al actualizar la cuenta: {0}', coverage: 'Solo sesiones locales; no incluye otros dispositivos ni uso sin registrar.', disabled: 'Monitoreo de Codex desactivado', refreshButton: 'Actualizar',
    plan: 'Plan: {0}', credits: 'Créditos: {0}', sourceLocal: 'Fuente: registros de sesiones locales', sourceAccount: 'Fuente: cuenta de Codex',
    completed: 'Codex · {0}: turno completado', taskFailed: 'Codex · {0}: tarea fallida', interrupted: 'Codex · {0}: tarea interrumpida',
    planProgress: 'Codex · {0}: plan {1}/{2} · {3}', todo: 'Codex · {0}: pendientes {1}/{2} · {3}', goal: 'Codex · {0}: objetivo {1}',
    subagent: 'Codex · {0}: subagente {1}', more: '{0} actualizaciones más', blocked: 'Codex · {0}: tarea bloqueada', approval: 'Codex · {0}: esperando aprobación', quotaLow: 'Codex · {0}: {1}% restante',
  },
  'pt-BR': {
    group: 'Monitoramento do Codex', enabled: 'Monitorar o Codex', enabledHelp: 'Ler o progresso local, o uso de tokens e os limites da conta.',
    home: 'Pasta de dados do Codex', homeHelp: 'Vazio: usar CODEX_HOME e depois .codex na pasta pessoal.',
    executable: 'Executável do Codex', executableHelp: 'Vazio: localizar o app ou CLI do Codex instalado e ler limites via app-server.',
    refresh: 'Intervalo de atualização da conta', refreshHelp: 'Segundos entre solicitações de limites; mínimo de 300 segundos (5 minutos).', seconds: 's',
    title: 'Conta do Codex', today: 'Hoje local: {0} tokens', local: 'Total local: {0} tokens', quota: '{0}: {1}% usado · {2}% restante',
    window: 'Janela de {0} minutos', reset: 'Redefinição: {0}', updated: 'Atualizado: {0}', stale: 'Os dados da conta estão desatualizados', missing: 'Limites da conta indisponíveis',
    failed: 'Falha ao atualizar a conta: {0}', coverage: 'Somente sessões locais; exclui outros dispositivos e uso não registrado.', disabled: 'Monitoramento do Codex desativado', refreshButton: 'Atualizar',
    plan: 'Plano: {0}', credits: 'Créditos: {0}', sourceLocal: 'Fonte: registros de sessões locais', sourceAccount: 'Fonte: conta do Codex',
    completed: 'Codex · {0}: turno concluído', taskFailed: 'Codex · {0}: falha na tarefa', interrupted: 'Codex · {0}: tarefa interrompida',
    planProgress: 'Codex · {0}: plano {1}/{2} · {3}', todo: 'Codex · {0}: pendências {1}/{2} · {3}', goal: 'Codex · {0}: objetivo {1}',
    subagent: 'Codex · {0}: subagente {1}', more: 'Mais {0} atualizações', blocked: 'Codex · {0}: tarefa bloqueada', approval: 'Codex · {0}: aguardando aprovação', quotaLow: 'Codex · {0}: {1}% restante',
  },
  it: {
    group: 'Monitoraggio Codex', enabled: 'Monitora Codex', enabledHelp: 'Leggi avanzamento locale, utilizzo dei token e limiti dell’account.',
    home: 'Cartella dati di Codex', homeHelp: 'Vuoto: usa CODEX_HOME, poi .codex nella cartella personale.',
    executable: 'Eseguibile Codex', executableHelp: 'Vuoto: cerca l’app o CLI Codex installata e leggi i limiti tramite app-server.',
    refresh: 'Intervallo di aggiornamento account', refreshHelp: 'Secondi tra le richieste dei limiti; almeno 300 secondi (5 minuti).', seconds: 's',
    title: 'Account Codex', today: 'Oggi in locale: {0} token', local: 'Totale locale: {0} token', quota: '{0}: {1}% usato · {2}% rimanente',
    window: 'Finestra di {0} minuti', reset: 'Ripristino: {0}', updated: 'Aggiornato: {0}', stale: 'Dati dell’account non aggiornati', missing: 'Limiti dell’account non disponibili',
    failed: 'Aggiornamento account non riuscito: {0}', coverage: 'Solo sessioni locali; esclusi altri dispositivi e utilizzi non registrati.', disabled: 'Monitoraggio Codex disattivato', refreshButton: 'Aggiorna',
    plan: 'Piano: {0}', credits: 'Crediti: {0}', sourceLocal: 'Fonte: registri delle sessioni locali', sourceAccount: 'Fonte: account Codex',
    completed: 'Codex · {0}: turno completato', taskFailed: 'Codex · {0}: attività non riuscita', interrupted: 'Codex · {0}: attività interrotta',
    planProgress: 'Codex · {0}: piano {1}/{2} · {3}', todo: 'Codex · {0}: attività {1}/{2} · {3}', goal: 'Codex · {0}: obiettivo {1}',
    subagent: 'Codex · {0}: sottoagente {1}', more: 'Altri {0} aggiornamenti', blocked: 'Codex · {0}: attività bloccata', approval: 'Codex · {0}: in attesa di approvazione', quotaLow: 'Codex · {0}: {1}% rimanente',
  },
  ru: {
    group: 'Мониторинг Codex', enabled: 'Отслеживать Codex', enabledHelp: 'Читать локальный прогресс задач, расход токенов и лимиты аккаунта.',
    home: 'Папка данных Codex', homeHelp: 'Если пусто: CODEX_HOME, затем .codex в домашней папке.',
    executable: 'Исполняемый файл Codex', executableHelp: 'Если пусто: найти установленное приложение или CLI Codex и читать лимиты через app-server.',
    refresh: 'Интервал обновления аккаунта', refreshHelp: 'Интервал запросов лимитов: не менее 300 секунд (5 минут).', seconds: 'с',
    title: 'Аккаунт Codex', today: 'Локально сегодня: {0} токенов', local: 'Локальный итог: {0} токенов', quota: '{0}: использовано {1}% · осталось {2}%',
    window: 'Окно: {0} мин.', reset: 'Сброс: {0}', updated: 'Обновлено: {0}', stale: 'Данные аккаунта устарели', missing: 'Лимиты аккаунта недоступны',
    failed: 'Ошибка обновления аккаунта: {0}', coverage: 'Только локальные сеансы; другие устройства и незаписанный расход не учтены.', disabled: 'Мониторинг Codex выключен', refreshButton: 'Обновить',
    plan: 'Тариф: {0}', credits: 'Кредиты: {0}', sourceLocal: 'Источник: локальные журналы сеансов', sourceAccount: 'Источник: аккаунт Codex',
    completed: 'Codex · {0}: ход завершён', taskFailed: 'Codex · {0}: ошибка задачи', interrupted: 'Codex · {0}: задача прервана',
    planProgress: 'Codex · {0}: план {1}/{2} · {3}', todo: 'Codex · {0}: дела {1}/{2} · {3}', goal: 'Codex · {0}: цель {1}',
    subagent: 'Codex · {0}: субагент {1}', more: 'Ещё обновлений: {0}', blocked: 'Codex · {0}: задача заблокирована', approval: 'Codex · {0}: ожидается одобрение', quotaLow: 'Codex · {0}: осталось {1}%',
  },
};

/** Account aggregate labels and terminal states; values retain the source's unknown states. */
const labels: Record<Language, readonly [string, string, string, string, string, string, string, string]> = {
  en: ['Account today', 'Account total', 'Completed', 'Blocked', 'Failed', 'Interrupted', 'Local session usage unavailable', 'History reads are limited; usage may be incomplete or approximate.'],
  zh: ['账户今日', '账户累计', '已完成', '受阻', '失败', '已中断', '本机会话用量暂不可用', '历史读取受限，用量数值可能不完整或为近似值。'],
  'zh-Hant': ['帳戶今日', '帳戶累計', '已完成', '受阻', '失敗', '已中斷', '本機對話用量暫時無法取得', '歷史讀取受限，用量數值可能不完整或為近似值。'],
  ja: ['アカウント本日', 'アカウント累計', '完了', '進行不可', '失敗', '中断', 'ローカル会話の使用量を取得できません', '履歴の読み取りに制限があるため、使用量は不完全または概算の場合があります。'],
  ko: ['계정 오늘', '계정 누적', '완료', '차단됨', '실패', '중단됨', '로컬 대화 사용량을 사용할 수 없습니다', '기록 읽기가 제한되어 사용량이 불완전하거나 근사치일 수 있습니다.'],
  fr: ['Compte aujourd’hui', 'Total du compte', 'Terminé', 'Bloqué', 'Échec', 'Interrompu', 'Utilisation des sessions locales indisponible', 'Lecture de l’historique limitée ; l’utilisation peut être incomplète ou approximative.'],
  de: ['Konto heute', 'Konto insgesamt', 'Abgeschlossen', 'Blockiert', 'Fehlgeschlagen', 'Unterbrochen', 'Lokaler Sitzungsverbrauch nicht verfügbar', 'Der Verlauf wird begrenzt gelesen; Verbrauchswerte können unvollständig oder Näherungswerte sein.'],
  'es-419': ['Cuenta hoy', 'Total de la cuenta', 'Completado', 'Bloqueado', 'Fallido', 'Interrumpido', 'Uso de sesiones locales no disponible', 'La lectura del historial es limitada; el uso puede estar incompleto o ser aproximado.'],
  'pt-BR': ['Conta hoje', 'Total da conta', 'Concluído', 'Bloqueado', 'Falhou', 'Interrompido', 'Uso de sessões locais indisponível', 'A leitura do histórico é limitada; o uso pode estar incompleto ou ser aproximado.'],
  it: ['Account oggi', 'Totale account', 'Completato', 'Bloccato', 'Non riuscito', 'Interrotto', 'Utilizzo delle sessioni locali non disponibile', 'Lettura della cronologia limitata; l’utilizzo può essere incompleto o approssimativo.'],
  ru: ['Аккаунт сегодня', 'Итого по аккаунту', 'Завершено', 'Заблокировано', 'Ошибка', 'Прервано', 'Расход локальных сеансов недоступен', 'Чтение истории ограничено; расход может быть неполным или приблизительным.'],
};

function format(template: string, ...values: (string | number)[]): string {
  return template.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}

export function codexText(language: Language = 'zh') {
  const t = copies[language] ?? en;
  const l = labels[language] ?? labels.en;
  const stateLabel = (state: string) => {
    if (state === 'complete' || state === 'completed') return l[2];
    if (state === 'blocked') return l[3];
    if (state === 'failed' || state === 'errored') return l[4];
    if (state === 'interrupted' || state === 'cancelled' || state === 'aborted') return l[5];
    return state;
  };
  return {
    config: {
      group: t.group,
      enabled: { title: t.enabled, description: t.enabledHelp },
      home: { title: t.home, description: t.homeHelp },
      executable: { title: t.executable, description: t.executableHelp },
      accountRefresh: { title: t.refresh, description: t.refreshHelp, suffix: t.seconds },
    },
    account: {
      title: t.title,
      accountTodayTokens: (tokens: string) => `${l[0]}: ${tokens} token`,
      accountTokens: (tokens: string) => `${l[1]}: ${tokens} token`,
      todayTokens: (tokens: string) => format(t.today, tokens),
      localTokens: (tokens: string) => format(t.local, tokens),
      quota: (label: string, used: number, remaining: number) => format(t.quota, label, used, remaining),
      window: (minutes: number) => format(t.window, minutes),
      reset: (time: string) => format(t.reset, time),
      updated: (time: string) => format(t.updated, time),
      stale: t.stale, missing: t.missing, localMissing: l[6],
      failed: (reason: string) => format(t.failed, reason),
      limitedCoverage: t.coverage, partialCoverage: l[7], disabled: t.disabled, refresh: t.refreshButton,
      plan: (label: string) => format(t.plan, label),
      credits: (label: string) => format(t.credits, label),
      sourceLocal: t.sourceLocal, sourceAccount: t.sourceAccount,
    },
    progress: {
      completed: (session: string) => format(t.completed, session),
      failed: (session: string) => format(t.taskFailed, session),
      interrupted: (session: string) => format(t.interrupted, session),
      plan: (session: string, done: number, total: number, latest: string) => format(t.planProgress, session, done, total, latest),
      todo: (session: string, done: number, total: number, latest: string) => format(t.todo, session, done, total, latest),
      goal: (session: string, state: string) => format(t.goal, session, stateLabel(state)),
      subagent: (session: string, state: string) => format(t.subagent, session, stateLabel(state)),
      more: (n: number) => format(t.more, n),
      blocked: (session: string) => format(t.blocked, session),
      approval: (session: string) => format(t.approval, session),
      quotaLow: (label: string, remaining: number) => format(t.quotaLow, label, remaining),
    },
  };
}
export type CodexText = ReturnType<typeof codexText>;
