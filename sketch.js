/**
 * 國中國文成語簡易練習測驗｜Google Sheets 已發布 CSV 題庫版
 * ------------------------------------------------------------------
 * 本檔案與 index.html 放在同一資料夾即可使用。
 * 題庫使用老師提供的「已發布 CSV 網址」，不是一般試算表 ID。
 * 老師只要修改 Google 試算表，並重新發布或更新發布內容，網站就能在背景更新時取得新題庫。
 * 不需要填寫 GOOGLE_SHEET_ID，也不需要填寫 GOOGLE_SHEET_NAME。
 */

// ================================================================
// 一、Google Sheets 題庫設定
// ================================================================

// 這是 Google Sheets 的「已發布 CSV 網址」，不是一般試算表編輯網址或試算表 ID。
// 老師只要修改試算表內容，並重新發布或更新發布內容即可；不需要修改程式碼。
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRF7HLRHq1GYKAse3ycZCzRsFWOnJ5fpPkQfWE7z7pw36iffgogPHhptG3fsO9hj72fBa2NBIZdUYIg/pub?gid=479092399&single=true&output=csv";

// 題庫成功載入後，每隔多久重新讀取一次；單位是毫秒，60000 = 60 秒。
const GOOGLE_SHEET_REFRESH_MS = 60000;

// ================================================================
// 二、全域色彩、字型與題庫狀態
// ================================================================

// 題目指定的畫布背景色。
const BACKGROUND_COLOR = "#cfbaf0";

// 題目指定的答對選項與正確答案顏色。
const CORRECT_COLOR = "#fcbf49";

// 題目指定的答錯選項顏色。
const WRONG_COLOR = "#ff9770";

// 其餘介面使用的輔助色彩，方便集中修改整體風格。
const INK_COLOR = "#3d315b";
const CARD_COLOR = "#fffaf2";
// 題目顯示方框的指定底色，讓題幹與下方選項清楚區隔。
const QUESTION_CARD_COLOR = "#faedcd";
const WHITE_COLOR = "#ffffff";
const MUTED_COLOR = "#6d6284";
const BORDER_COLOR = "#b59fd6";
const BUTTON_COLOR = "#6c5ce7";
const BUTTON_HOVER_COLOR = "#5748cf";
const SHADOW_COLOR = "rgba(61, 49, 91, 0.16)";

// 主要字型使用 Google Fonts 的繁體中文字型，並以 Isometra 與 sans-serif 作為備援。
const FONT_FAMILY = '"LXGW WenKai Mono TC", "Isometra", sans-serif';
const FALLBACK_FONT_FAMILY = 'sans-serif';

// 記錄 Google Fonts 是否已完成載入；尚未載入時先使用瀏覽器預設字型。
let fontsReady = false;

// 每個有效題目會整理成：{ id, question, options: [四個選項], answer }。
let questionBank = [];

// 背景更新的新題庫先放在 pendingQuestionBank，不中斷正在進行的測驗；下一次重新測驗時才套用。
let pendingQuestionBank = null;

// 初次載入與結果頁重新讀取需要顯示阻塞式狀態；背景更新不阻塞測驗。
let isLoadingQuestionBank = true;
let isRestartingQuiz = false;
let dataLoadError = "";
let dataNotice = "";
let dataNoticeUntil = 0;
let refreshTimer = null;
let refreshRequestInProgress = false;

// ================================================================
// 二、測驗狀態變數
// ================================================================

// 保存 p5.js 畫布物件，方便設定畫布樣式。
let canvas;

// 保存本次抽出的五題與目前題號。
let quizQuestions = [];
let currentQuestionIndex = 0;

// 保存目前題目的選項排列與正確選項索引。
let currentOptions = [];
let correctOptionIndex = -1;

// 保存使用者目前選到的選項；每題開始時重設為 -1。
let currentSelectedOption = -1;

// hasAnswered 用來防止同一題重複計分。
let hasAnswered = false;

// score 保存總分；每答對一題固定增加 20 分，滿分為 100 分。
let score = 0;
// correctAnswers 保存答對題數，結果頁會顯示「答對 X / 5 題」。
let correctAnswers = 0;
// quizFinished 表示是否已經進入總成績畫面。
let quizFinished = false;

// 以下變數保存結果頁的持續動畫物件。
let fireworks = [];
let encouragementParticles = [];
let lastFireworkTime = 0;
let resultEffectMode = "";

// 保存動畫開始時間，供答對上下跳、答錯左右移使用。
let animationStartTime = 0;

// 過濾觸控後緊接著產生的重複滑鼠事件。
let lastPointerTime = -1000;
let lastPointerX = -9999;
let lastPointerY = -9999;


// ================================================================
// 三、Google Sheets CSV 載入、CSV 解析、題庫驗證與錯誤處理
// ================================================================

// 本程式直接讀取已發布的 CSV 網址，不使用一般試算表 ID、分頁名稱或 API key。
// mode：initial 初次載入、refresh 背景更新、restart 結果頁重新測驗。
async function loadQuestionBank(mode = "initial") {
  if (mode === "initial") {
    isLoadingQuestionBank = true;
    dataLoadError = "";
  } else if (mode === "restart") {
    if (isRestartingQuiz) return;
    isRestartingQuiz = true;
    dataLoadError = "";
  } else {
    if (refreshRequestInProgress) return;
    refreshRequestInProgress = true;
  }

  try {
    // 使用老師提供的完整「已發布 CSV 網址」讀取題庫。
    // cache: "no-store" 可避免瀏覽器一直使用舊的 CSV 快取內容。
    const response = await fetch(GOOGLE_SHEET_CSV_URL, {
      method: "GET",
      cache: "no-store",
      headers: { "Accept": "text/csv" }
    });
    if (!response.ok) throw new Error(`Google Sheets 回應 HTTP ${response.status}`);

    const csvText = await response.text();
    const validationResult = validateQuestionRows(parseCsv(csvText));
    if (validationResult.validQuestions.length < 5) {
      throw new Error(
        `有效題目只有 ${validationResult.validQuestions.length} 題，至少需要 5 題。` +
        (validationResult.invalidCount > 0 ? `另有 ${validationResult.invalidCount} 筆資料無效。` : "")
      );
    }

    const warning = validationResult.invalidCount > 0
      ? `已略過 ${validationResult.invalidCount} 筆無效資料，剩下 ${validationResult.validQuestions.length} 題可用。`
      : `題庫讀取成功，共 ${validationResult.validQuestions.length} 題。`;

    if (mode === "initial") {
      questionBank = validationResult.validQuestions;
      pendingQuestionBank = null;
      isLoadingQuestionBank = false;
      dataLoadError = "";
      resetQuiz();
      showDataNotice(warning, 7000);
      startAutomaticRefresh();
    } else if (mode === "restart") {
      // 重新測驗成功後才套用新題庫並重新抽五題。
      questionBank = validationResult.validQuestions;
      pendingQuestionBank = null;
      isRestartingQuiz = false;
      dataLoadError = "";
      resetQuiz();
      showDataNotice(`重新讀取成功。${warning}`, 7000);
      startAutomaticRefresh();
    } else {
      // 背景更新只保存新題庫，不改變正在作答的 quizQuestions。
      pendingQuestionBank = validationResult.validQuestions;
      refreshRequestInProgress = false;
      showDataNotice(`Google 試算表已更新；按「重新測驗」後套用。${warning}`, 9000);
    }
  } catch (error) {
    const detail = error && error.message ? `（${error.message}）` : "";
    const browserHint = "請確認已發布 CSV 仍有效、試算表內容已重新發布或更新發布內容，且網站是透過網頁伺服器開啟。";

    if (mode === "initial") {
      isLoadingQuestionBank = false;
      questionBank = [];
      dataLoadError = `已發布 CSV 題庫載入失敗${detail} ${browserHint} 請稍後重新整理網頁。`;
    } else if (mode === "restart") {
      // 失敗時保留目前可用題庫，不中斷程式。
      isRestartingQuiz = false;
      showDataNotice(`重新讀取失敗${detail} 已保留目前題庫，請稍後再試。${browserHint}`, 12000);
    } else {
      // 背景更新失敗只顯示非阻塞提示，正在進行的測驗照常繼續。
      refreshRequestInProgress = false;
      showDataNotice(`題庫自動更新失敗${detail}，目前測驗會繼續使用原題庫。${browserHint}`, 12000);
    }
  }
}

// 題庫成功載入後才啟動自動更新；重新測驗成功也會重新計時。
function startAutomaticRefresh() {
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => loadQuestionBank("refresh"), Math.max(1000, Number(GOOGLE_SHEET_REFRESH_MS) || 60000));
}

// CSV 解析器逐字處理逗號、換行、雙引號與雙引號跳脫（""），
// 欄位內可放逗號或換行，不能用簡單 split(",") 取代。
function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];
    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// 驗證固定標題與每一筆資料；無效列略過並回報數量。
function validateQuestionRows(rows) {
  const expectedHeaders = ["id", "question", "optionA", "optionB", "optionC", "optionD", "answer"];
  const result = { validQuestions: [], invalidCount: 0 };
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("CSV 沒有資料列。");

  const actualHeaders = rows[0].map((value, index) => {
    const text = String(value ?? "").trim();
    return index === 0 ? text.replace(/^\uFEFF/, "") : text;
  });
  const headersAreCorrect = actualHeaders.length === expectedHeaders.length &&
    expectedHeaders.every((header, index) => actualHeaders[index] === header);
  if (!headersAreCorrect) throw new Error(`標題欄位必須固定為：${expectedHeaders.join(",")}`);

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || row.every((value) => String(value ?? "").trim() === "")) continue;
    if (row.length !== expectedHeaders.length) {
      result.invalidCount += 1;
      continue;
    }
    const values = row.map((value) => String(value ?? "").trim());
    const [id, question, optionA, optionB, optionC, optionD, answer] = values;
    const options = [optionA, optionB, optionC, optionD];
    const isValid = id.length > 0 && question.length > 0 &&
      options.every((option) => option.length > 0) && new Set(options).size === 4 &&
      answer.length > 0 && options.includes(answer);
    if (!isValid) {
      result.invalidCount += 1;
      continue;
    }
    result.validQuestions.push({ id, question, options, answer });
  }
  return result;
}

// 非阻塞提示不會蓋住目前題目，也不會停止測驗動畫。
function showDataNotice(message, duration = 8000) {
  dataNotice = String(message || "");
  dataNoticeUntil = millis() + duration;
}

// 題庫初次載入或設定錯誤時顯示大字狀態頁。
function drawDataStatusScreen(title, subtitle) {
  const scale = clampNumber(Math.min(width / 420, height / 700), 0.8, 1.35);
  fill(INK_COLOR);
  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(clampNumber(30 * scale, 22, 42));
  text(title, width / 2, height * 0.42);
  textStyle(NORMAL);
  textSize(clampNumber(19 * scale, 16, 26));
  const statusMessage = `${subtitle}\n\n操作提示：載入成功後點選選項作答；完成測驗後按「重新測驗」會重新讀取最新題庫。`;
  const statusLines = wrapTextLines(statusMessage, Math.min(width * 0.86, 760), clampNumber(19 * scale, 16, 26));
  const lineHeight = clampNumber(29 * scale, 24, 38);
  const startY = height * 0.53 - (statusLines.length - 1) * lineHeight / 2;
  for (let lineIndex = 0; lineIndex < statusLines.length; lineIndex += 1) {
    text(statusLines[lineIndex], width / 2, startY + lineIndex * lineHeight);
  }
}

// ================================================================
// 三、p5.js 生命週期函式
// ================================================================

// setup() 只執行一次：建立全螢幕畫布、設定字型並啟動第一回合測驗。
function setup() {
  // 依瀏覽器目前寬高建立畫布，達成全螢幕效果。
  canvas = createCanvas(windowWidth, windowHeight);

  // 讓 canvas 成為區塊元素，避免 HTML 行內元素造成底部多餘空白。
  canvas.style("display", "block");

  // 避免高解析度手機造成不必要的繪圖負擔，同時保持畫面尺寸正確。
  pixelDensity(1);

  // 先設定不必等待網路的預設字型，避免 Google Fonts 載入期間阻塞測驗。
  textFont(FALLBACK_FONT_FAMILY);
  textAlign(CENTER, CENTER);
  textStyle(NORMAL);

  // 若瀏覽器支援 Font Loading API，字型載入完成後切換到指定 Google Fonts。
  // 這是非同步處理，不會阻擋題目顯示、點擊或其他測驗功能。
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      fontsReady = true;
      textFont(FONT_FAMILY);
      redraw();
    }).catch(() => {
      // 字型載入失敗時保留預設字型，確保測驗仍可正常使用。
      fontsReady = false;
    });
  }

  // 使用 p5.js 的平滑繪圖效果，讓卡片和文字邊緣更清楚。
  smooth();

  // 啟動已發布 CSV 題庫載入；網址已直接寫入本程式，不需要老師設定 ID。
  loadQuestionBank("initial");
}

// applyQuizFont() 統一設定 p5.js 的文字字型，確保所有文字繪製都使用同一組字型。
function applyQuizFont() {
  textFont(fontsReady ? FONT_FAMILY : FALLBACK_FONT_FAMILY);
}

// draw() 每一幀執行：重畫背景，再依測驗狀態繪製測驗或成績畫面。
function draw() {
  // 每幀套用目前可用的字型；Google Fonts 載入後會自動改用指定字型。
  applyQuizFont();

  // 每幀清除畫布，確保動畫移動時不留下殘影。
  background(BACKGROUND_COLOR);

  // 每一幀重新計算版面，視窗或畫布變化時不必手動更新座標。
  const layout = getLayout();

  // 初次載入、設定未完成或結果頁重新讀取時，顯示清楚的狀態訊息。
  if (isLoadingQuestionBank) {
    drawDataStatusScreen(
      "正在連線至 Google 試算表，請稍候……",
      "正在讀取已發布 CSV 題庫；載入後每次會隨機抽出 5 題。"
    );
    return;
  }
  if (isRestartingQuiz) {
    drawDataStatusScreen("正在重新讀取題庫，請稍候……", "讀取成功後會重新抽出 5 題");
    return;
  }
  if (dataLoadError) {
    drawDataStatusScreen("題庫設定或載入發生問題", dataLoadError);
    return;
  }

  // 尚未完成五題時顯示答題介面，完成後顯示總成績介面。
  if (quizFinished) {
    drawResultScreen(layout);
  } else {
    drawQuizScreen(layout);
  }
  drawDataNotice();
}

// windowResized() 是 p5.js 在瀏覽器視窗大小改變時自動呼叫的函式。
function windowResized() {
  // 依照題目要求，將畫布調整成新的視窗寬高。
  resizeCanvas(windowWidth, windowHeight);
}

// mousePressed() 處理滑鼠按下，並交給共用的指標事件函式。
function mousePressed() {
  handlePointerInput(mouseX, mouseY);
  return false;
}

// touchStarted() 處理觸控，滑鼠與觸控共用同一套判斷邏輯。
function touchStarted() {
  // 只取第一個觸控點，避免多指同時造成重複作答。
  if (touches.length > 0) {
    handlePointerInput(touches[0].x, touches[0].y);
  }
  return false;
}


// ================================================================
// 四、測驗流程函式
// ================================================================

// resetQuiz() 重新抽取五題並清除所有上一回合狀態。
function resetQuiz() {
  // 防護檢查：Google Sheets 尚未成功載入或有效題目不足五題時，不進行抽題。
  if (!Array.isArray(questionBank) || questionBank.length < 5) {
    return;
  }

  // 每次重設都複製並洗牌「完整 Google Sheets 題庫」，再隨機抽出五題，絕不固定題目。
  const shuffledBank = shuffleArray(questionBank);
  quizQuestions = shuffledBank.slice(0, 5);

  // 清除本回合的題號、分數和完成狀態。
  currentQuestionIndex = 0;
  score = 0;
  correctAnswers = 0;
  quizFinished = false;

  // 清除上一回合的煙火與鼓勵粒子，避免重新測驗後殘留舊動畫。
  fireworks = [];
  encouragementParticles = [];
  lastFireworkTime = 0;
  resultEffectMode = "";

  // 準備第一題的選項。
  prepareCurrentQuestion();
}

// prepareCurrentQuestion() 打亂目前題目的四個選項並重設作答狀態。
function prepareCurrentQuestion() {
  // 取得目前題目資料。
  const questionData = quizQuestions[currentQuestionIndex];

  // 每題獨立複製並打亂選項，讓答案位置不固定。
  currentOptions = shuffleArray(questionData.options);

  // 依答案文字找到打亂後的正確選項位置。
  correctOptionIndex = currentOptions.indexOf(questionData.answer);

  // 新題目尚未作答，並且清除上一題的選項記錄。
  currentSelectedOption = -1;
  hasAnswered = false;
  animationStartTime = 0;
}

// answerQuestion() 只允許每題第一次點擊進行判定和計分。
function answerQuestion(selectedIndex) {
  // 已作答或測驗完成時直接返回，防止重複計分。
  if (hasAnswered || quizFinished) {
    return;
  }

  // 先標記為已作答，再判定答案，避免快速連點產生競態狀況。
  hasAnswered = true;
  currentSelectedOption = selectedIndex;

  // 每題答對增加 20 分；答錯不扣分，五題滿分為 100 分。
  if (selectedIndex === correctOptionIndex) {
    score += 20;
    correctAnswers += 1;
  }

  // 記錄動畫起點，讓答題結果從這一刻開始移動。
  animationStartTime = millis();
}

// goToNextQuestion() 前往下一題，或在第五題後進入成績畫面。
function goToNextQuestion() {
  // 尚未回答時不允許跳題，確保每題都完成判定。
  if (!hasAnswered) {
    return;
  }

  // 尚有下一題時，增加索引並準備新題目。
  if (currentQuestionIndex < quizQuestions.length - 1) {
    currentQuestionIndex += 1;
    prepareCurrentQuestion();
  } else {
    // 五題完成後切換成績畫面。
    quizFinished = true;
  }
}

// shuffleArray() 使用 Fisher-Yates 演算法回傳新的隨機排列陣列。
function shuffleArray(sourceArray) {
  // 先複製，避免直接修改 CSV 題庫或原始選項。
  const result = sourceArray.slice();

  // 從最後一個位置往前交換隨機元素。
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = floor(random(index + 1));
    const temporaryValue = result[index];
    result[index] = result[randomIndex];
    result[randomIndex] = temporaryValue;
  }

  return result;
}


// ================================================================
// 五、真正響應式的版面計算
// ================================================================

// clampNumber() 將數值限制在最小值和最大值之間，避免小螢幕破版。
function clampNumber(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// getLayout() 是整個響應式設計的核心，所有繪圖和點擊判定都使用同一份資料。
function getLayout() {
  // layoutScale 是整體放大基準：以畫布寬高及短邊共同計算，避免只看寬度造成手機橫向失衡。
  const shortSide = Math.min(width, height);
  const layoutScale = clampNumber(Math.min(width / 420, height / 700), 0.72, 1.20);

  // compactScale 只壓縮間距、內距與卡片高度，不優先縮小文字，讓小螢幕仍保有可讀性。
  const isCompact = height < 620 || height / Math.max(width, 1) < 0.72;
  const compactScale = height < 500 ? 0.68 : (isCompact ? 0.82 : 1);
  const isNarrow = width < 580;
  const isPortrait = height >= width;

  // 外側邊距與內容寬度的上下限，負責手機、平板和桌機的左右留白。
  const margin = clampNumber(shortSide * 0.042, 10, 52);
  const contentWidth = Math.min(Math.max(0, width - margin * 2), 980);
  const contentX = (width - contentWidth) / 2;

  // 以下是放大後的文字基準：相較舊版約增加 20%～35%。
  // clampNumber 的最小值保護小螢幕可讀性，寬度限制則防止標題超出畫面。
  const titleSizeBase = 35 * layoutScale;
  const titleSize = Math.min(
    clampNumber(titleSizeBase, width < 330 ? 18 : 22, 42),
    Math.max(width < 330 ? 18 : 20, contentWidth / 13.8)
  );
  const progressSize = clampNumber(20 * layoutScale, 14, 24);
  const questionSize = clampNumber(26 * layoutScale, 17, 32);
  const optionSize = clampNumber(22 * layoutScale, 16, 27);
  const labelSize = clampNumber(18 * layoutScale, 14, 23);
  const feedbackSize = clampNumber(20 * layoutScale, 15, 25);

  // 高度不足時，手機直向改用雙欄，避免四張選項卡片把重要按鈕推到畫面外。
  // 高度充足的手機直向保留單欄，讓放大後的選項文字有較寬的閱讀空間。
  const useSingleColumn = isNarrow && isPortrait && !isCompact && height >= 730;
  const optionColumns = useSingleColumn ? 1 : 2;
  const optionRows = Math.ceil(4 / optionColumns);

  // 標題、進度與題目區的垂直距離；compactScale 主要在手機橫向及矮視窗發揮作用。
  const titleLineHeight = titleSize * 1.15;
  const headerY = margin + titleLineHeight * 0.52;
  const progressY = headerY + titleLineHeight * 0.72;
  const sectionGap = clampNumber(18 * layoutScale * compactScale, 8, 25);
  const questionY = progressY + progressSize * 0.74 + sectionGap;

  // 題目卡片內距、題幹行距與換行寬度同步放大，避免文字貼邊或被截斷。
  const cardPadding = clampNumber(27 * layoutScale * compactScale, 14, 38);
  const questionLineHeight = questionSize * 1.42;
  const questionTextWidth = Math.max(80, contentWidth - cardPadding * 2);
  const questionLines = wrapTextLines(getCurrentQuestionText(), questionTextWidth, questionSize);
  const questionLabelHeight = labelSize * 1.25;
  const questionTextGap = clampNumber(10 * layoutScale * compactScale, 5, 14);
  const questionHeight = cardPadding + questionLabelHeight + questionTextGap +
    questionLines.length * questionLineHeight + cardPadding * 0.78;

  // 選項間距與文字左右內距也隨字體放大，但在小螢幕適度壓縮。
  const optionGap = clampNumber(16 * layoutScale * compactScale, 7, 20);
  const optionStartY = questionY + questionHeight + sectionGap;
  const optionTextSidePadding = clampNumber(20 * layoutScale * compactScale, 10, 27);
  const cellWidth = (contentWidth - optionGap * (optionColumns - 1)) / optionColumns;
  const optionTextWidth = Math.max(
    44,
    cellWidth - optionTextSidePadding * 2 - optionSize * 1.58
  );
  const optionLineHeight = optionSize * 1.32;
  const longestOptionLines = currentOptions.length > 0
    ? Math.max(...currentOptions.map((option) => wrapTextLines(option, optionTextWidth, optionSize).length))
    : 1;

  // 答題後保留提示文字、下一題按鈕與底部邊距；所有數值都會在矮畫面壓縮。
  const buttonHeight = clampNumber(58 * layoutScale * compactScale, 44, 70);
  const buttonGap = clampNumber(12 * layoutScale * compactScale, 6, 16);
  const feedbackGap = clampNumber(12 * layoutScale * compactScale, 6, 17);
  const feedbackLineHeight = feedbackSize * 1.38;
  const feedbackText = getFeedbackText();
  const feedbackLines = wrapTextLines(feedbackText, contentWidth * 0.92, feedbackSize);
  const feedbackHeight = hasAnswered
    ? Math.max(feedbackLineHeight, feedbackLines.length * feedbackLineHeight)
    : feedbackLineHeight;
  const bottomMargin = clampNumber(18 * layoutScale * compactScale, 8, 22);
  const answeredReserve = feedbackGap + feedbackHeight + buttonGap + buttonHeight + bottomMargin;
  const bottomReserve = hasAnswered ? answeredReserve : bottomMargin;
  const availableOptionHeight = height - optionStartY - bottomReserve;

  // 選項卡片同步放大；至少保留足夠高度放置放大後的中文與 A～D 標記。
  const idealOptionHeight = clampNumber(
    Math.max(88, longestOptionLines * optionLineHeight + optionTextSidePadding * 1.35) * compactScale,
    48,
    116
  );
  const calculatedOptionHeight = (availableOptionHeight - optionGap * (optionRows - 1)) / optionRows;
  const minimumOptionHeight = clampNumber(
    (longestOptionLines * optionLineHeight + optionTextSidePadding * 0.95) * compactScale,
    42,
    78
  );
  // max 會優先配合可用高度；minimumOptionHeight 只在一般尺寸下保證文字不被卡片切掉。
  const optionHeight = Math.max(
    minimumOptionHeight,
    Math.min(idealOptionHeight, calculatedOptionHeight)
  );

  const optionsHeight = optionRows * optionHeight + optionGap * (optionRows - 1);
  const optionsEndY = optionStartY + optionsHeight;
  const feedbackY = optionsEndY + feedbackGap;
  const nextButtonY = feedbackY + feedbackHeight + buttonGap;

  return {
    layoutScale,
    compactScale,
    margin,
    contentX,
    contentWidth,
    isCompact,
    isNarrow,
    isPortrait,
    titleSize,
    titleLineHeight,
    progressSize,
    questionSize,
    optionSize,
    labelSize,
    headerY,
    progressY,
    sectionGap,
    questionY,
    cardPadding,
    questionLineHeight,
    questionTextWidth,
    questionLines,
    questionLabelHeight,
    questionTextGap,
    questionHeight,
    optionColumns,
    optionRows,
    optionGap,
    optionStartY,
    optionHeight,
    optionsHeight,
    optionsEndY,
    optionTextSidePadding,
    optionTextWidth,
    optionLineHeight,
    feedbackSize,
    feedbackLineHeight,
    feedbackLines,
    feedbackHeight,
    feedbackGap,
    buttonGap,
    buttonHeight,
    bottomMargin,
    feedbackY,
    nextButtonY
  };
}

// 取得目前題幹，初始化或成績畫面沒有題目時回傳空字串。
function getCurrentQuestionText() {
  if (!quizQuestions[currentQuestionIndex]) {
    return "";
  }
  return quizQuestions[currentQuestionIndex].question;
}

// 取得作答後的提示文字，供版面計算與實際繪圖共用。
function getFeedbackText() {
  if (!hasAnswered) {
    return "";
  }

  if (getSelectedOptionIndex() === correctOptionIndex) {
    return "答對了！做得很好。";
  }

  return `答錯了，正確答案是「${currentOptions[correctOptionIndex]}」。`;
}


// drawDataNotice() 顯示自動更新、無效資料或背景錯誤，不會阻擋使用者作答。
function drawDataNotice() {
  if (!dataNotice || millis() > dataNoticeUntil) return;
  const noticeSize = clampNumber(Math.min(width, height) * 0.021, 12, 17);
  const noticeWidth = Math.min(width * 0.88, 920);
  const noticeLines = wrapTextLines(dataNotice, noticeWidth, noticeSize);
  const lineHeight = noticeSize * 1.35;
  const totalHeight = noticeLines.length * lineHeight + 16;
  const noticeX = (width - noticeWidth) / 2;
  const noticeY = height - totalHeight - 10;
  noStroke();
  fill(61, 49, 91, 218);
  rect(noticeX, noticeY, noticeWidth, totalHeight, 12);
  fill(WHITE_COLOR);
  textAlign(CENTER, CENTER);
  textStyle(NORMAL);
  textSize(noticeSize);
  for (let lineIndex = 0; lineIndex < noticeLines.length; lineIndex += 1) {
    text(noticeLines[lineIndex], width / 2, noticeY + 8 + lineHeight * (lineIndex + 0.5));
  }
}

// ================================================================
// 六、主要繪圖區塊
// ================================================================

// drawQuizScreen() 負責組合答題畫面的所有元件。
function drawQuizScreen(layout) {
  drawHeader(layout);
  drawQuestionCard(layout);
  drawOptions(layout);

  // 只有作答後才顯示答案提示和下一題按鈕。
  if (hasAnswered) {
    drawAnswerFeedback(layout);
    drawNextButton(layout);
  }
}

// drawHeader() 繪製標題和目前題目進度。
function drawHeader(layout) {
  drawTitle(layout, "國中國文成語簡易練習測驗");

  fill(MUTED_COLOR);
  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(NORMAL);
  textSize(layout.progressSize);
  text(`第 ${currentQuestionIndex + 1} 題／共 ${quizQuestions.length} 題`, width / 2, layout.progressY);
}

// drawTitle() 統一處理測驗頁和成績頁的主標題。
function drawTitle(layout, title) {
  fill(INK_COLOR);
  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(layout.titleSize);
  text(title, width / 2, layout.headerY);
}

// drawQuestionCard() 繪製題目卡片、題目標籤和自動換行題幹。
function drawQuestionCard(layout) {
  const cardX = layout.contentX;
  const cardY = layout.questionY;

  // 先畫卡片陰影和圓角底色。
  // 題目方框使用指定的 #faedcd 背景色，與選項區域形成明顯區隔。
  drawCard(
    cardX,
    cardY,
    layout.contentWidth,
    layout.questionHeight,
    layout.cardPadding * 0.7,
    QUESTION_CARD_COLOR
  );

  // 顯示題目標籤。
  fill(BUTTON_COLOR);
  noStroke();
  textAlign(LEFT, TOP);
  textStyle(BOLD);
  textSize(layout.labelSize);
  text("題目", cardX + layout.cardPadding, cardY + layout.cardPadding * 0.55);

  // 顯示依卡片寬度自動換行的題幹。
  fill(INK_COLOR);
  textStyle(NORMAL);
  textSize(layout.questionSize);
  drawWrappedText(
    getCurrentQuestionText(),
    cardX + layout.cardPadding,
    cardY + layout.cardPadding * 0.55 + layout.questionLabelHeight + layout.questionTextGap,
    layout.questionTextWidth,
    layout.questionSize,
    layout.questionLineHeight
  );
}

// drawOptions() 依欄列配置繪製四個選項，適應手機、平板與桌機。
function drawOptions(layout) {
  for (let index = 0; index < currentOptions.length; index += 1) {
    // 以索引換算目前選項所在的欄和列。
    const column = index % layout.optionColumns;
    const row = Math.floor(index / layout.optionColumns);

    // 計算選項卡片的基準座標。
    const cellWidth = (layout.contentWidth - layout.optionGap * (layout.optionColumns - 1)) / layout.optionColumns;
    const baseX = layout.contentX + column * (cellWidth + layout.optionGap);
    const baseY = layout.optionStartY + row * (layout.optionHeight + layout.optionGap);
    const animationOffset = getOptionAnimationOffset(index);

    // 將動畫位移套用到選項卡片，但點擊判定仍只在可點擊階段使用原始位置。
    drawOption(
      index,
      baseX + animationOffset.x,
      baseY + animationOffset.y,
      cellWidth,
      layout.optionHeight,
      layout
    );
  }
}

// drawOption() 繪製單一選項的底色、字母標記和自動換行文字。
function drawOption(index, x, y, optionWidth, optionHeight, layout) {
  // 未作答使用卡片色；作答後正確選項使用黃色，選錯的選項使用橘色。
  let optionColor = CARD_COLOR;
  if (hasAnswered) {
    if (index === correctOptionIndex) {
      optionColor = CORRECT_COLOR;
    } else if (index === getSelectedOptionIndex()) {
      optionColor = WRONG_COLOR;
    }
  }

  // 繪製圓角選項卡片。
  fill(optionColor);
  stroke(BORDER_COLOR);
  strokeWeight(Math.max(1, layout.layoutScale * 1.6));
  rect(x, y, optionWidth, optionHeight, layout.layoutScale * 14);
  noStroke();

  // 顯示 A、B、C、D 選項標記。
  const optionLabel = String.fromCharCode(65 + index);
  const labelX = x + layout.optionTextSidePadding;
  fill(INK_COLOR);
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(layout.optionSize);
  text(`${optionLabel}.`, labelX, y + optionHeight / 2);

  // 顯示選項文字；中文內容會依卡片實際寬度自動換行。
  const textX = x + layout.optionTextSidePadding + layout.optionSize * 1.45;
  const textWidthValue = Math.max(40, optionWidth - (textX - x) - layout.optionTextSidePadding);
  const optionLineHeight = layout.optionSize * 1.3;
  const optionLines = wrapTextLines(currentOptions[index], textWidthValue, layout.optionSize);
  const textBlockHeight = optionLines.length * optionLineHeight;

  fill(INK_COLOR);
  textStyle(NORMAL);
  drawWrappedText(
    currentOptions[index],
    textX,
    y + (optionHeight - textBlockHeight) / 2,
    textWidthValue,
    layout.optionSize,
    optionLineHeight
  );
}

// drawAnswerFeedback() 在作答後顯示答對提示，或顯示正確答案。
function drawAnswerFeedback(layout) {
  fill(INK_COLOR);
  noStroke();
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(layout.feedbackSize);
  drawWrappedText(
    getFeedbackText(),
    width / 2 - layout.contentWidth * 0.46,
    layout.feedbackY,
    layout.contentWidth * 0.92,
    layout.feedbackSize,
    layout.feedbackLineHeight
  );
}

// drawNextButton() 繪製下一題或第五題完成後的查看成績按鈕。
function drawNextButton(layout) {
  const buttonText = currentQuestionIndex === quizQuestions.length - 1 ? "查看成績" : "下一題";
  const buttonWidth = Math.min(layout.contentWidth * 0.72, 300 * layout.layoutScale);
  const buttonX = (width - buttonWidth) / 2;

  drawButton(buttonX, layout.nextButtonY, buttonWidth, layout.buttonHeight, buttonText);
}

// getResultCardLayout() 集中計算結果卡片，確保繪圖與觸控判定使用相同座標。
function getResultCardLayout(layout) {
  // 結果卡片高度隨視窗調整；矮螢幕使用幾乎全高，但保留最小邊距。
  const cardWidth = Math.min(layout.contentWidth, 700);
  const cardMargin = Math.max(layout.margin, 10);
  const availableCardHeight = Math.max(220, height - cardMargin * 2);
  const cardHeight = Math.min(
    Math.max(300 * layout.layoutScale * layout.compactScale, height * 0.78),
    availableCardHeight
  );
  const cardX = (width - cardWidth) / 2;
  const cardY = Math.max(cardMargin, (height - cardHeight) / 2 + layout.titleSize * 0.32);
  const innerPadding = clampNumber(layout.cardPadding * 0.9, 14, 34);
  const buttonWidth = Math.min(cardWidth - innerPadding * 2, 300 * layout.layoutScale);
  const buttonHeight = clampNumber(58 * layout.layoutScale * layout.compactScale, 44, 70);
  const buttonY = cardY + cardHeight - buttonHeight - innerPadding;

  return {
    cardWidth,
    cardMargin,
    cardHeight,
    cardX,
    cardY,
    innerPadding,
    buttonWidth,
    buttonHeight,
    buttonX: (width - buttonWidth) / 2,
    buttonY
  };
}

// drawResultScreen() 繪製完成五題後的答對題數、總分與重新測驗按鈕。
function drawResultScreen(layout) {
  // 先播放背景特效，再繪製不透明結果卡片，避免特效干擾重要文字。
  drawResultEffect(layout);
  drawTitle(layout, "國中國文成語簡易練習測驗");

  const resultLayout = getResultCardLayout(layout);
  const {
    cardWidth,
    cardHeight,
    cardX,
    cardY,
    innerPadding,
    buttonWidth,
    buttonHeight,
    buttonX,
    buttonY
  } = resultLayout;

  drawCard(cardX, cardY, cardWidth, cardHeight, layout.layoutScale * 22, CARD_COLOR);

  // 結果頁文字基準同步放大，並用卡片寬度限制分數，避免手機橫向溢出。
  const resultTitleSize = Math.min(
    clampNumber(layout.titleSize * 1.12, 26, 46),
    cardWidth / 8.2
  );
  const scoreSize = Math.min(
    clampNumber(layout.titleSize * 1.90, 42, 76),
    cardWidth / 8.0
  );
  const resultTextSize = clampNumber(layout.progressSize * 1.20, 17, 28);
  const messageSize = clampNumber(layout.progressSize * 1.10, 16, 25);

  fill(INK_COLOR);
  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(resultTitleSize);
  text("測驗完成！", width / 2, cardY + cardHeight * 0.13);

  fill(BUTTON_COLOR);
  textSize(scoreSize);
  text(`${score} / 100 分`, width / 2, cardY + cardHeight * 0.31);

  fill(INK_COLOR);
  textSize(resultTextSize);
  text(`答對 ${correctAnswers} / 5 題`, width / 2, cardY + cardHeight * 0.48);
  text(`總分：${score} / 100 分`, width / 2, cardY + cardHeight * 0.58);

  fill(score >= 60 ? BUTTON_COLOR : MUTED_COLOR);
  textStyle(BOLD);
  textSize(messageSize);
  const messageWidth = Math.max(80, cardWidth - innerPadding * 2);
  const messageLines = wrapTextLines(getResultMessage(), messageWidth, messageSize);
  const messageLineHeight = messageSize * 1.38;
  const messageCenterY = cardY + cardHeight * 0.70;
  const messageStartY = messageCenterY - (messageLines.length - 1) * messageLineHeight / 2;
  for (let lineIndex = 0; lineIndex < messageLines.length; lineIndex += 1) {
    text(messageLines[lineIndex], width / 2, messageStartY + lineIndex * messageLineHeight);
  }

  drawButton(buttonX, buttonY, buttonWidth, buttonHeight, "重新測驗");
}

// drawButton() 是下一題與重新測驗共用的響應式按鈕繪圖函式。
function drawButton(x, y, buttonWidth, buttonHeight, label) {
  // 桌機滑鼠移入按鈕時變色；觸控裝置沒有 hover 也不會影響操作。
  const isHovered = isPointInside(mouseX, mouseY, x, y, buttonWidth, buttonHeight);
  const buttonFill = isHovered ? BUTTON_HOVER_COLOR : BUTTON_COLOR;

  // 先畫半透明陰影，再畫按鈕本體。
  noStroke();
  fill(SHADOW_COLOR);
  rect(x, y + buttonHeight * 0.10, buttonWidth, buttonHeight, buttonHeight * 0.28);

  fill(buttonFill);
  rect(x, y, buttonWidth, buttonHeight, buttonHeight * 0.28);

  // 依按鈕高度設定文字大小，確保手機上仍然容易閱讀。
  fill(WHITE_COLOR);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(clampNumber(buttonHeight * 0.34, 15, 22));
  text(label, x + buttonWidth / 2, y + buttonHeight / 2);
}

// drawCard() 統一繪製卡片陰影、圓角、底色及邊框。
function drawCard(x, y, cardWidth, cardHeight, radius, cardColor = CARD_COLOR) {
  // 卡片陰影會隨畫布縮放，避免在手機上顯得過厚。
  noStroke();
  fill(SHADOW_COLOR);
  rect(x, y + Math.max(3, radius * 0.18), cardWidth, cardHeight, radius);

  // 卡片本體使用呼叫端傳入的底色；題目卡片會傳入 #faedcd。
  fill(cardColor);
  stroke(BORDER_COLOR);
  strokeWeight(Math.max(1, radius * 0.07));
  rect(x, y, cardWidth, cardHeight, radius);
  noStroke();
}


// ================================================================
// 七、答對上下跳、答錯左右移的動畫
// ================================================================

// getOptionAnimationOffset() 回傳指定選項目前應該移動的 x、y 位移量。
function getOptionAnimationOffset(index) {
  // 未作答時不移動任何選項。
  if (!hasAnswered || animationStartTime === 0) {
    return { x: 0, y: 0 };
  }

  // 以正弦波產生平滑往返動畫。
  const elapsed = millis() - animationStartTime;
  const wave = Math.sin(elapsed * 0.012);
  const movementAmount = clampNumber(Math.min(width, height) * 0.018, 5, 11);

  // 正確答案上下跳動。
  if (index === correctOptionIndex) {
    return { x: 0, y: wave * movementAmount };
  }

  // 使用者選錯的選項左右移動。
  if (index === getSelectedOptionIndex()) {
    return { x: wave * movementAmount, y: 0 };
  }

  // 其他選項保持靜止。
  return { x: 0, y: 0 };
}

// getSelectedOptionIndex() 集中回傳選項索引，避免從顏色反推選擇結果。
function getSelectedOptionIndex() {
  return typeof currentSelectedOption === "number" ? currentSelectedOption : -1;
}


// ================================================================
// 八、結果頁煙火與加油鼓勵特效
// ================================================================

// drawResultEffect() 根據總分選擇及格煙火或不及格鼓勵特效。
function drawResultEffect(layout) {
  // 及格門檻為 60 分，也就是五題中至少答對三題。
  if (score >= 60) {
    drawFireworks(layout);
  } else {
    drawEncouragementEffect(layout);
  }
}

// drawFireworks() 持續產生煙火，包含發射、爆炸、重力與粒子淡出。
function drawFireworks(layout) {
  const currentTime = millis();
  const smallestSide = Math.min(width, height);

  // 初次進入結果頁立即發射一枚，之後每隔一段時間持續發射。
  if (lastFireworkTime === 0 || currentTime - lastFireworkTime > 850) {
    fireworks.push(createFirework(layout));
    lastFireworkTime = currentTime;
  }

  // 由後往前更新並移除已經淡出的煙火物件。
  for (let index = fireworks.length - 1; index >= 0; index -= 1) {
    const firework = fireworks[index];
    updateFirework(firework, smallestSide);
    drawFirework(firework, smallestSide);
    if (firework.dead) {
      fireworks.splice(index, 1);
    }
  }

  resultEffectMode = "fireworks";
}

// createFirework() 建立一枚從畫面下方升空的煙火火箭。
function createFirework(layout) {
  // 煙火主要分布在左右兩側與上半部，避免干擾中央成績卡片。
  const side = random() < 0.5 ? 1 : -1;
  const horizontalRange = Math.max(18, width * 0.38);
  const centerX = width / 2 + side * random(width * 0.20, horizontalRange);
  const targetY = random(height * 0.14, height * 0.42);
  const fireworkColors = ["#fcbf49", "#ff9770", "#90dbf4", "#a3e635", "#f7aef8"];

  return {
    x: clampNumber(centerX, width * 0.08, width * 0.92),
    y: height + 10,
    targetY,
    speed: clampNumber(Math.min(width, height) * 0.012, 5, 10),
    color: random(fireworkColors),
    exploded: false,
    particles: [],
    dead: false
  };
}

// updateFirework() 更新火箭升空、爆炸後粒子的速度與重力。
function updateFirework(firework, smallestSide) {
  if (!firework.exploded) {
    // 火箭向上移動，抵達目標高度後爆炸。
    firework.y -= firework.speed;
    if (firework.y <= firework.targetY) {
      firework.exploded = true;
      createFireworkParticles(firework, smallestSide);
    }
    return;
  }

  // 爆炸粒子受到重力影響，速度逐漸變慢並且透明度逐幀降低。
  for (const particle of firework.particles) {
    particle.x += particle.velocityX;
    particle.y += particle.velocityY;
    particle.velocityY += particle.gravity;
    particle.velocityX *= 0.985;
    particle.alpha -= particle.fadeSpeed;
  }

  // 當所有粒子都淡出後，移除整枚煙火以控制效能。
  firework.particles = firework.particles.filter((particle) => particle.alpha > 0);
  firework.dead = firework.particles.length === 0;
}

// createFireworkParticles() 在火箭爆炸位置建立向四周噴出的粒子。
function createFireworkParticles(firework, smallestSide) {
  const particleCount = Math.round(clampNumber(smallestSide * 0.20, 28, 72));
  for (let index = 0; index < particleCount; index += 1) {
    const angle = random(TWO_PI);
    const speed = random(1.5, clampNumber(smallestSide * 0.014, 3.2, 7));
    firework.particles.push({
      x: firework.x,
      y: firework.y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      gravity: clampNumber(smallestSide * 0.00012, 0.025, 0.075),
      alpha: 255,
      fadeSpeed: random(2.5, 5.5),
      size: random(2, clampNumber(smallestSide * 0.008, 3, 6))
    });
  }
}

// drawFirework() 繪製升空火箭或爆炸後的發光粒子。
function drawFirework(firework, smallestSide) {
  if (!firework.exploded) {
    stroke(firework.color);
    strokeWeight(clampNumber(smallestSide * 0.006, 2, 4));
    line(firework.x, firework.y + 8, firework.x, firework.y + 22);
    noStroke();
    fill(WHITE_COLOR);
    circle(firework.x, firework.y, clampNumber(smallestSide * 0.012, 3, 7));
    return;
  }

  // 以半透明外圈加實心核心，製造柔和、不刺眼的煙火光感。
  for (const particle of firework.particles) {
    const particleColor = color(firework.color);
    particleColor.setAlpha(particle.alpha * 0.28);
    fill(particleColor);
    noStroke();
    circle(particle.x, particle.y, particle.size * 3.5);
    particleColor.setAlpha(particle.alpha);
    fill(particleColor);
    circle(particle.x, particle.y, particle.size);
  }
}

// drawEncouragementEffect() 繪製漂浮愛心、星星、圓點與脈動光圈。
function drawEncouragementEffect(layout) {
  initializeEncouragementParticles();

  const currentTime = millis();
  const smallestSide = Math.min(width, height);

  // 更新並繪製邊緣粒子；粒子會從底部向上漂浮，超出畫面後重新出現。
  for (const particle of encouragementParticles) {
    particle.y -= particle.speed;
    particle.x += Math.sin(currentTime * 0.0015 + particle.phase) * particle.drift;
    particle.rotation += particle.rotationSpeed;

    if (particle.y < -particle.size * 2) {
      particle.y = height + particle.size;
      particle.x = random(width);
    }

    // 成績卡片位於中央，背景特效主要放在左右邊緣。
    if (particle.x > width * 0.24 && particle.x < width * 0.76) {
      particle.x += particle.x < width / 2 ? -particle.size * 0.7 : particle.size * 0.7;
    }

    drawEncouragementParticle(particle);
  }

  // 四角的脈動光圈提供明顯但柔和的加油氛圍。
  const pulse = (Math.sin(currentTime * 0.004) + 1) / 2;
  const ringSize = clampNumber(smallestSide * (0.06 + pulse * 0.025), 24, 68);
  noFill();
  stroke(255, 255, 255, 80 + pulse * 45);
  strokeWeight(clampNumber(smallestSide * 0.006, 2, 5));
  circle(width * 0.10, height * 0.18, ringSize);
  circle(width * 0.90, height * 0.78, ringSize * 0.85);
  noStroke();

  resultEffectMode = "encouragement";
}

// initializeEncouragementParticles() 第一次進入不及格結果頁時建立粒子。
function initializeEncouragementParticles() {
  if (resultEffectMode === "encouragement" && encouragementParticles.length > 0) {
    return;
  }

  encouragementParticles = [];
  const particleCount = Math.round(clampNumber(Math.min(width, height) * 0.055, 16, 34));
  const particleTypes = ["heart", "star", "dot"];

  for (let index = 0; index < particleCount; index += 1) {
    const isLeft = index % 2 === 0;
    encouragementParticles.push({
      x: isLeft ? random(width * 0.04, width * 0.25) : random(width * 0.75, width * 0.96),
      y: random(height),
      size: random(10, clampNumber(Math.min(width, height) * 0.035, 17, 30)),
      speed: random(0.25, 0.8),
      drift: random(0.3, 1.1),
      phase: random(TWO_PI),
      rotation: random(TWO_PI),
      rotationSpeed: random(-0.015, 0.015),
      type: random(particleTypes),
      color: random(["#f7aef8", "#90dbf4", "#fcbf49", "#ff9770"])
    });
  }
}

// drawEncouragementParticle() 依粒子類型繪製愛心、星星或柔和圓點。
function drawEncouragementParticle(particle) {
  push();
  translate(particle.x, particle.y);
  rotate(particle.rotation);
  fill(particle.color);
  noStroke();

  if (particle.type === "heart") {
    // 使用兩個圓與一個三角形組成不需外部套件的愛心圖形。
    circle(-particle.size * 0.25, -particle.size * 0.12, particle.size * 0.52);
    circle(particle.size * 0.25, -particle.size * 0.12, particle.size * 0.52);
    triangle(
      -particle.size * 0.52,
      -particle.size * 0.02,
      particle.size * 0.52,
      -particle.size * 0.02,
      0,
      particle.size * 0.70
    );
  } else if (particle.type === "star") {
    drawStar(0, 0, particle.size * 0.25, particle.size * 0.58, 5);
  } else {
    circle(0, 0, particle.size * 0.55);
  }
  pop();
}

// drawStar() 繪製鼓勵特效使用的五角星。
function drawStar(x, y, innerRadius, outerRadius, points) {
  beginShape();
  for (let index = 0; index < points * 2; index += 1) {
    const angle = -HALF_PI + index * PI / points;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    vertex(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  endShape(CLOSE);
}


// ================================================================
// 九、滑鼠、觸控與按鈕互動
// ================================================================

// handlePointerInput() 統一處理滑鼠點擊和觸控點擊。
function handlePointerInput(pointerX, pointerY) {
  // 過濾觸控後約 250 毫秒內、且位置相近的重複滑鼠事件。
  const currentTime = millis();
  const closeToLastPointer = dist(pointerX, pointerY, lastPointerX, lastPointerY) < 30;
  if (currentTime - lastPointerTime < 250 && closeToLastPointer) {
    return;
  }

  // 記錄本次指標事件。
  lastPointerTime = currentTime;
  lastPointerX = pointerX;
  lastPointerY = pointerY;

  // 成績畫面只接受重新測驗按鈕。
  if (quizFinished) {
    handleResultScreenInput(pointerX, pointerY);
    return;
  }

  // 作答後鎖定四個選項，只接受下一題按鈕，避免重複計分。
  if (hasAnswered) {
    const layout = getLayout();
    const buttonWidth = Math.min(layout.contentWidth * 0.72, 300 * layout.layoutScale);
    const buttonX = (width - buttonWidth) / 2;
    if (isPointInside(pointerX, pointerY, buttonX, layout.nextButtonY, buttonWidth, layout.buttonHeight)) {
      goToNextQuestion();
    }
    return;
  }

  // 尚未作答時，檢查點擊是否落在四個選項的可點擊矩形內。
  const selectedIndex = getOptionIndexAtPoint(pointerX, pointerY);
  if (selectedIndex !== -1) {
    answerQuestion(selectedIndex);
  }
}

// handleResultScreenInput() 判斷是否點擊了響應式重新測驗按鈕。
function handleResultScreenInput(pointerX, pointerY) {
  const layout = getLayout();
  const resultLayout = getResultCardLayout(layout);

  if (isPointInside(
    pointerX,
    pointerY,
    resultLayout.buttonX,
    resultLayout.buttonY,
    resultLayout.buttonWidth,
    resultLayout.buttonHeight
  )) {
    // 重新測驗先重新讀取 Google Sheets，成功後才重新抽出五題。
    loadQuestionBank("restart");
  }
}

// getOptionIndexAtPoint() 使用與繪圖完全相同的版面公式，確保點擊位置準確。
function getOptionIndexAtPoint(pointerX, pointerY) {
  const layout = getLayout();
  const cellWidth = (layout.contentWidth - layout.optionGap * (layout.optionColumns - 1)) / layout.optionColumns;

  for (let index = 0; index < currentOptions.length; index += 1) {
    const column = index % layout.optionColumns;
    const row = Math.floor(index / layout.optionColumns);
    const x = layout.contentX + column * (cellWidth + layout.optionGap);
    const y = layout.optionStartY + row * (layout.optionHeight + layout.optionGap);

    if (isPointInside(pointerX, pointerY, x, y, cellWidth, layout.optionHeight)) {
      return index;
    }
  }

  return -1;
}

// isPointInside() 判斷指標是否落在指定矩形內。
function isPointInside(pointX, pointY, rectX, rectY, rectWidth, rectHeight) {
  return pointX >= rectX && pointX <= rectX + rectWidth &&
    pointY >= rectY && pointY <= rectY + rectHeight;
}


// ================================================================
// 十、中文自動換行與成績鼓勵文字
// ================================================================

// wrapTextLines() 依實際字型寬度逐字換行，特別適合沒有空格的中文句子。
function wrapTextLines(content, maxWidth, fontSize) {
  textSize(fontSize);

  if (!content) {
    return [];
  }

  const characters = Array.from(content);
  const lines = [];
  let currentLine = "";

  for (const character of characters) {
    const testLine = currentLine + character;
    if (textWidth(testLine) > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = character;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

// drawWrappedText() 將換行結果逐行畫在指定起點。
function drawWrappedText(content, x, y, maxWidth, fontSize, lineHeight) {
  const lines = wrapTextLines(content, maxWidth, fontSize);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    text(lines[lineIndex], x, y + lineIndex * lineHeight);
  }
}

// getResultMessage() 依總分判斷及格或不及格，提供結果頁主訊息。
function getResultMessage() {
  if (score >= 60) {
    return "太棒了！恭喜你通過測驗！";
  }
  return "再接再厲！加油，你一定可以的！";
}
