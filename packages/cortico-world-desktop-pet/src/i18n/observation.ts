/** Screen-observation settings shown in both the World panel and everyday habits page. */
import type { Language } from 'cortico/core/language.ts';

const en = {
  group: 'Screen observation', enabled: 'Observe the screen',
  enabledHelp: 'Coo occasionally takes a screenshot and sends it to the current vision model for a short, playful comment. Model usage may be charged.',
  min: 'Shortest interval', max: 'Longest interval', seconds: 's',
  intervalHelp: 'After each observation, choose a new random interval within this range. Equal values give a fixed interval.',
  help: 'This switch permits screenshots only. Screenshots and replies are saved in local history; turning it off does not delete earlier records.',
  intervalError: 'Enter whole seconds from 30 to 86400, with the shortest interval no longer than the longest.',
  saveFailed: 'Could not save: {0}',
};
type Copy = Record<keyof typeof en, string>;
const copies: Record<Language, Copy> = {
  en,
  zh: {
    group: '屏幕观察', enabled: '观察屏幕',
    enabledHelp: 'Coo 偶尔截图并发送给当前视觉模型，表达一句简短调侃，可能消耗模型额度。',
    min: '最短间隔', max: '最长间隔', seconds: '秒',
    intervalHelp: '每次观察后，在此区间内重新随机下一次间隔；两项相同时为固定间隔。',
    help: '此开关只授权截图。截图与回复会保存在本地记录中；关闭不会删除此前记录。',
    intervalError: '请填写 30–86400 之间的整数秒，最短间隔不能大于最长间隔。', saveFailed: '保存失败：{0}',
  },
  'zh-Hant': {
    group: '螢幕觀察', enabled: '觀察螢幕',
    enabledHelp: 'Coo 偶爾截圖並傳送給目前的視覺模型，說一句簡短的打趣，可能消耗模型額度。',
    min: '最短間隔', max: '最長間隔', seconds: '秒',
    intervalHelp: '每次觀察後，在此範圍內重新隨機選擇下次間隔；兩項相同時為固定間隔。',
    help: '此開關只授權截圖。截圖與回覆會儲存在本機記錄中；關閉不會刪除先前記錄。',
    intervalError: '請填寫 30–86400 之間的整數秒，最短間隔不能大於最長間隔。', saveFailed: '儲存失敗：{0}',
  },
  ja: {
    group: '画面の観察', enabled: '画面を観察する',
    enabledHelp: 'Coo が時々スクリーンショットを現在の画像対応モデルに送り、短い冗談を言います。モデルの利用料金が発生する場合があります。',
    min: '最短間隔', max: '最長間隔', seconds: '秒',
    intervalHelp: '観察が終わるたびに、この範囲で次の間隔をランダムに選びます。同じ値なら一定間隔です。',
    help: 'このスイッチは撮影だけを許可します。画像と返答はローカル履歴に保存され、オフにしても過去の記録は削除されません。',
    intervalError: '30～86400 の整数秒を入力し、最短間隔を最長間隔以下にしてください。', saveFailed: '保存できませんでした：{0}',
  },
  ko: {
    group: '화면 관찰', enabled: '화면 관찰하기',
    enabledHelp: 'Coo가 가끔 화면을 캡처해 현재 시각 모델에 보내 짧은 농담을 합니다. 모델 사용 요금이 발생할 수 있습니다.',
    min: '최소 간격', max: '최대 간격', seconds: '초',
    intervalHelp: '관찰이 끝날 때마다 이 범위에서 다음 간격을 무작위로 정합니다. 두 값이 같으면 고정 간격입니다.',
    help: '이 스위치는 화면 캡처만 허용합니다. 이미지와 답변은 로컬 기록에 저장되며, 꺼도 이전 기록은 삭제되지 않습니다.',
    intervalError: '30~86400 사이의 정수 초를 입력하고 최소 간격이 최대 간격보다 크지 않도록 하세요.', saveFailed: '저장 실패: {0}',
  },
  fr: {
    group: 'Observation de l’écran', enabled: 'Observer l’écran',
    enabledHelp: 'Coo envoie parfois une capture au modèle visuel actuel pour une courte remarque amusante. L’utilisation du modèle peut être facturée.',
    min: 'Intervalle minimal', max: 'Intervalle maximal', seconds: 's',
    intervalHelp: 'Après chaque observation, un nouvel intervalle est tiré au hasard dans cette plage. Des valeurs égales donnent un intervalle fixe.',
    help: 'Ce réglage autorise uniquement les captures. Images et réponses sont conservées dans l’historique local ; le désactiver ne supprime pas les enregistrements précédents.',
    intervalError: 'Saisissez un nombre entier de secondes entre 30 et 86400, avec le minimum inférieur ou égal au maximum.', saveFailed: 'Échec de l’enregistrement : {0}',
  },
  de: {
    group: 'Bildschirmbeobachtung', enabled: 'Bildschirm beobachten',
    enabledHelp: 'Coo sendet gelegentlich ein Bildschirmfoto an das aktuelle Bildmodell für einen kurzen, scherzhaften Kommentar. Dabei können Modellkosten entstehen.',
    min: 'Kürzester Abstand', max: 'Längster Abstand', seconds: 's',
    intervalHelp: 'Nach jeder Beobachtung wird ein neuer zufälliger Abstand aus diesem Bereich gewählt. Gleiche Werte ergeben einen festen Abstand.',
    help: 'Dieser Schalter erlaubt nur Bildschirmfotos. Bilder und Antworten bleiben im lokalen Verlauf; Ausschalten löscht keine früheren Einträge.',
    intervalError: 'Ganze Sekunden von 30 bis 86400 eingeben. Der kürzeste Abstand darf den längsten nicht überschreiten.', saveFailed: 'Speichern fehlgeschlagen: {0}',
  },
  'es-419': {
    group: 'Observación de pantalla', enabled: 'Observar la pantalla',
    enabledHelp: 'Coo envía ocasionalmente una captura al modelo visual actual para hacer un comentario breve y bromista. El uso del modelo puede generar cargos.',
    min: 'Intervalo mínimo', max: 'Intervalo máximo', seconds: 's',
    intervalHelp: 'Después de cada observación se elige otro intervalo aleatorio dentro de este rango. Valores iguales producen un intervalo fijo.',
    help: 'Este interruptor solo autoriza capturas. Las imágenes y respuestas se guardan en el historial local; desactivarlo no elimina registros anteriores.',
    intervalError: 'Ingresa segundos enteros entre 30 y 86400; el mínimo no puede superar al máximo.', saveFailed: 'No se pudo guardar: {0}',
  },
  'pt-BR': {
    group: 'Observação da tela', enabled: 'Observar a tela',
    enabledHelp: 'Coo envia ocasionalmente uma captura ao modelo visual atual para fazer um comentário curto e divertido. O uso do modelo pode gerar cobrança.',
    min: 'Intervalo mínimo', max: 'Intervalo máximo', seconds: 's',
    intervalHelp: 'Após cada observação, um novo intervalo aleatório é escolhido nesta faixa. Valores iguais definem um intervalo fixo.',
    help: 'Este controle autoriza apenas capturas. Imagens e respostas ficam no histórico local; desativá-lo não exclui registros anteriores.',
    intervalError: 'Informe segundos inteiros de 30 a 86400, com o mínimo menor ou igual ao máximo.', saveFailed: 'Não foi possível salvar: {0}',
  },
  it: {
    group: 'Osservazione dello schermo', enabled: 'Osserva lo schermo',
    enabledHelp: 'Coo invia ogni tanto una schermata al modello visivo attuale per un breve commento scherzoso. L’uso del modello può avere un costo.',
    min: 'Intervallo minimo', max: 'Intervallo massimo', seconds: 's',
    intervalHelp: 'Dopo ogni osservazione viene scelto un nuovo intervallo casuale in questo intervallo. Valori uguali danno una cadenza fissa.',
    help: 'Questo interruttore autorizza solo le schermate. Immagini e risposte restano nella cronologia locale; disattivarlo non cancella i dati precedenti.',
    intervalError: 'Inserisci secondi interi da 30 a 86400; il minimo non può superare il massimo.', saveFailed: 'Salvataggio non riuscito: {0}',
  },
  ru: {
    group: 'Наблюдение за экраном', enabled: 'Наблюдать за экраном',
    enabledHelp: 'Coo иногда отправляет снимок текущей визуальной модели и коротко шутит о нём. Использование модели может быть платным.',
    min: 'Минимальный интервал', max: 'Максимальный интервал', seconds: 'с',
    intervalHelp: 'После каждого наблюдения следующий интервал выбирается случайно из этого диапазона. Одинаковые значения задают постоянный интервал.',
    help: 'Этот переключатель разрешает только снимки экрана. Изображения и ответы сохраняются в локальной истории; отключение не удаляет прежние записи.',
    intervalError: 'Введите целое число секунд от 30 до 86400; минимум не должен превышать максимум.', saveFailed: 'Не удалось сохранить: {0}',
  },
};

export function observationText(language: Language = 'zh') {
  const t = copies[language];
  return { config: {
    group: t.group,
    enabled: { title: t.enabled, description: t.enabledHelp },
    min: { title: t.min, description: t.intervalHelp },
    max: { title: t.max, description: t.intervalHelp },
    seconds: t.seconds, help: t.help, intervalHelp: t.intervalHelp, intervalError: t.intervalError,
    saveFailed: (reason: string) => t.saveFailed.replace('{0}', reason),
  } };
}
