import { FinanceGraph } from "./canvasGraph.js";

const DEFAULT_FUNDS = 10_000_000;
const START_YEAR = 1;
const START_MONTH = 4;
const INITIAL_STUDENT_DIVISOR = 200;
const STUDENTS_PER_DISPLAY_CLASS = 20;
const SUFFIX_OPTIONS = [
  { value: "塾", label: "塾" },
  { value: "教室", label: "教室" },
  { value: "アカデミー", label: "アカデミー" },
  { value: "ゼミナール", label: "ゼミナール" },
  { value: "予備校", label: "予備校" },
];

export class UIController {
  constructor({ simulation }) {
    this.simulation = simulation;
    this.activeCampusId = null;

    this.refs = {
      landingOverlay: document.getElementById("landing-overlay"),
      landingScreen: document.getElementById("landing-screen"),
      rulesScreen: document.getElementById("rules-screen"),
      launchBtn: document.getElementById("launch-game"),
      continueBtn: document.getElementById("continue-game"),
      secondaryLaunchBtn: document.getElementById("launch-game-secondary"),
      showRulesBtn: document.getElementById("show-rules"),
      rulesBackBtn: document.getElementById("rules-back"),
      conversationScreen: document.getElementById("conversation-screen"),
      appShell: document.getElementById("app-shell"),
      dashboard: document.getElementById("game-dashboard"),
      currentSchoolName: document.getElementById("current-school-name"),
      currentDate: document.getElementById("current-date"),
      elapsedMonths: document.getElementById("elapsed-months"),
      currentFunds: document.getElementById("current-funds"),
      campusTabs: document.getElementById("campus-tabs"),
      campusDetail: document.getElementById("campus-detail"),
      openCampusBtn: document.getElementById("open-campus"),
      toggleAdBtn: document.getElementById("toggle-ad"),
      saveBtn: document.getElementById("save-game"),
      loadBtn: document.getElementById("load-game"),
      nextMonthBtn: document.getElementById("next-month"),
      financeCanvas: document.getElementById("finance-graph"),
      modalLayer: document.getElementById("modal-layer"),
      conversationLine: document.getElementById("conversation-line"),
      conversationInput: document.getElementById("conversation-input-area"),
      conversationError: document.getElementById("conversation-error"),
      conversationText: document.getElementById("conversation-text"),
      conversationNext: document.getElementById("conversation-next"),
      conversationNextLabel: document.getElementById("conversation-next-label"),
      conversationWindow: document.getElementById("conversation-window"),
      conversationCollapse: document.getElementById("conversation-collapse"),
      conversationMini: document.getElementById("conversation-mini"),
      metricTotalStudents: document.getElementById("metric-total-students"),
      metricTotalStudentsDelta: document.getElementById("metric-total-students-delta"),
      metricAvgSatisfaction: document.getElementById("metric-avg-satisfaction"),
      metricAvgSatisfactionDelta: document.getElementById("metric-avg-satisfaction-delta"),
      systemBanner: document.getElementById("system-banner"),
    };

    this.conversationSteps = [];
    this.conversationIndex = 0;
    this.conversationState = this.createInitialConversationState();
    this.paginationState = {};
    this.inManagementMode = false;
    this.conversationAdvanceVisible = true;
    this.conversationMiniTimer = null;
    this.lastMonthlySummary = null;
    this.pendingCampaignResult = false;
    this.pendingCampaignSummary = null;
    this.allowConversationCollapse = false;
    this.pendingTeacherShortages = [];
    this.pendingMonthlySummary = null;
    this.modalLocked = false;
    this.systemMessageTimer = null;
  }

  initialize() {
    this.financeGraph = new FinanceGraph(this.refs.financeCanvas);
    this.bindEvents();
    this.conversationSteps = this.createConversationSteps();
    this.conversationIndex = 0;
    this.conversationState = this.createInitialConversationState();
    this.showLandingScreen();
    this.updateHeader();
    this.renderCanvasPlaceholder();
  }

  bindEvents() {
    this.refs.launchBtn?.addEventListener("click", () => this.handleLaunchClick());
    this.refs.secondaryLaunchBtn?.addEventListener("click", () => this.handleLaunchClick());
    this.refs.continueBtn?.addEventListener("click", () => this.handleContinueFromLanding());
    this.refs.showRulesBtn?.addEventListener("click", () => this.showRulesScreen());
    this.refs.rulesBackBtn?.addEventListener("click", () => this.showLandingScreen());
    this.refs.conversationNext?.addEventListener("click", () => this.handleConversationAdvance());

    this.refs.nextMonthBtn?.addEventListener("click", () => {
      if (!this.simulation.hasActiveGame()) {
        return;
      }
      if (this.simulation.isCampaignComplete()) {
        this.showCampaignCompleteModal();
        return;
      }
      if (this.pendingTeacherShortages.length) {
        return;
      }
      const summary = this.simulation.advanceMonth();
      const shortages = this.simulation.getTeacherShortages();
      if (shortages.length) {
        this.refreshUI();
        this.pendingMonthlySummary = summary ?? null;
        this.setConversationLine("生徒数の増加により先生が不足しています。追加採用を完了してください。");
        this.promptTeacherHiring(shortages);
        return;
      }
      this.consumeMonthlySummary(summary);
    });

    this.refs.openCampusBtn?.addEventListener("click", () => this.handleOpenCampus());
    this.refs.toggleAdBtn?.addEventListener("click", () => this.handleToggleAd());
    this.refs.saveBtn?.addEventListener("click", () => this.handleSave());
    this.refs.loadBtn?.addEventListener("click", () => this.handleLoad());

    this.refs.conversationCollapse?.addEventListener("click", () => this.collapseConversationWindow());
    this.refs.conversationMini?.addEventListener("click", () => this.restoreConversationWindow());
    this.refs.conversationText?.addEventListener("click", (event) => this.handleConversationTextClick(event));

    this.refs.modalLayer?.addEventListener("click", (event) => {
      if (event.target === this.refs.modalLayer && !this.modalLocked) {
        this.hideModal();
      }
    });
  }

  handleConversationTextClick(event) {
    if (!this.isConversationAdvanceAvailable()) {
      return;
    }
    if (event.target.closest("button")) {
      return;
    }
    this.refs.conversationNext?.click();
  }

  isConversationAdvanceAvailable() {
    const button = this.refs.conversationNext;
    if (!button || this.inManagementMode) {
      return false;
    }
    return !button.classList.contains("hidden") && !button.disabled;
  }

  setConversationAdvanceVisibility(visible) {
    this.conversationAdvanceVisible = visible;
    this.applyConversationAdvanceVisibility();
  }

  applyConversationAdvanceVisibility() {
    const button = this.refs.conversationNext;
    const text = this.refs.conversationText;
    if (!button) {
      return;
    }
    const shouldShow = this.conversationAdvanceVisible && !this.inManagementMode;
    button.classList.toggle("hidden", !shouldShow);
    if (text) {
      text.classList.toggle("advance-clickable", shouldShow);
    }
  }

  setConversationCollapseEnabled(enabled) {
    this.allowConversationCollapse = enabled;
    if (this.refs.conversationCollapse) {
      this.refs.conversationCollapse.classList.toggle("hidden", !enabled);
    }
    if (!enabled) {
      this.restoreConversationWindow();
      this.refs.conversationMini?.classList.add("hidden");
    }
  }

  enterConversationMode() {
    this.inManagementMode = false;
    this.restoreConversationWindow();
    this.setConversationCollapseEnabled(false);
    this.refs.conversationScreen?.classList.remove("hidden");
    this.refs.conversationInput?.classList.remove("hidden");
    this.refs.appShell?.classList.add("hidden");
    this.refs.dashboard?.classList.add("hidden");
    this.applyConversationAdvanceVisibility();
    this.clearConversationError();
  }

  enterManagementMode() {
    this.inManagementMode = true;
    this.restoreConversationWindow();
    this.setConversationCollapseEnabled(true);
    this.refs.conversationScreen?.classList.remove("hidden");
    this.refs.conversationInput?.classList.add("hidden");
    this.refs.appShell?.classList.remove("hidden");
    this.refs.dashboard?.classList.remove("hidden");
    this.applyConversationAdvanceVisibility();
    this.clearConversationError();
  }

  collapseConversationWindow() {
    if (!this.allowConversationCollapse) {
      return;
    }
    if (!this.refs.conversationWindow || this.isConversationCollapsed()) {
      return;
    }
    this.refs.conversationWindow.classList.add("collapsed");
    this.refs.conversationMini?.classList.remove("hidden");
  }

  restoreConversationWindow() {
    if (!this.refs.conversationWindow) {
      return;
    }
    this.refs.conversationWindow.classList.remove("collapsed");
    this.refs.conversationMini?.classList.add("hidden");
    this.clearConversationMiniNotification();
  }

  isConversationCollapsed() {
    return this.refs.conversationWindow?.classList.contains("collapsed");
  }

  flashConversationMini() {
    const mini = this.refs.conversationMini;
    if (!mini) {
      return;
    }
    mini.classList.add("notify");
    if (this.conversationMiniTimer) {
      clearTimeout(this.conversationMiniTimer);
    }
    this.conversationMiniTimer = setTimeout(() => {
      mini.classList.remove("notify");
      this.conversationMiniTimer = null;
    }, 2000);
  }

  clearConversationMiniNotification() {
    if (this.conversationMiniTimer) {
      clearTimeout(this.conversationMiniTimer);
      this.conversationMiniTimer = null;
    }
    this.refs.conversationMini?.classList.remove("notify");
  }

  setConversationLine(message) {
    if (this.refs.conversationLine) {
      this.refs.conversationLine.textContent = message;
    }
    if (this.isConversationCollapsed()) {
      this.flashConversationMini();
    } else {
      this.clearConversationMiniNotification();
    }
  }

  setConversationError(message) {
    const target = this.refs.conversationError;
    if (!target) {
      return;
    }
    if (!message) {
      target.textContent = "";
      target.classList.add("hidden");
      return;
    }
    target.textContent = message;
    target.classList.remove("hidden");
  }

  clearConversationError() {
    this.setConversationError("");
  }

  showSystemMessage(message, type = "error") {
    const banner = this.refs.systemBanner;
    if (!banner || !message) {
      return;
    }
    banner.textContent = message;
    banner.classList.remove("hidden", "success", "info");
    if (type === "success") {
      banner.classList.add("success");
    } else if (type === "info") {
      banner.classList.add("info");
    }
    if (this.systemMessageTimer) {
      clearTimeout(this.systemMessageTimer);
    }
    this.systemMessageTimer = window.setTimeout(() => {
      this.clearSystemMessage();
    }, 4500);
  }

  clearSystemMessage() {
    if (this.systemMessageTimer) {
      clearTimeout(this.systemMessageTimer);
      this.systemMessageTimer = null;
    }
    const banner = this.refs.systemBanner;
    if (!banner) {
      return;
    }
    banner.textContent = "";
    banner.classList.add("hidden");
    banner.classList.remove("success", "info");
  }

  showModalError(modal, message) {
    if (!modal) {
      this.showSystemMessage(message);
      return;
    }
    let errorEl = modal.querySelector(".modal-error");
    if (!errorEl) {
      errorEl = document.createElement("p");
      errorEl.className = "modal-error";
      const head = modal.querySelector(".modal-head");
      if (head) {
        head.insertAdjacentElement("afterend", errorEl);
      } else {
        modal.insertBefore(errorEl, modal.firstChild);
      }
    }
    errorEl.textContent = message;
  }

  handleLaunchClick() {
    this.clearSystemMessage();
    this.showLandingScreen();
    this.conversationSteps = this.createConversationSteps();
    this.refs.landingOverlay?.classList.add("hidden");
    this.enterConversationMode();
    this.resetConversation();
    this.renderConversationStep();
  }

  returnToTitleScreen() {
    this.pendingCampaignResult = false;
    this.pendingCampaignSummary = null;
    this.pendingTeacherShortages = [];
    this.pendingMonthlySummary = null;
    this.lastMonthlySummary = null;
    this.activeCampusId = null;
    if (typeof this.simulation.resetGameState === "function") {
      this.simulation.resetGameState();
    }
    this.hideModal(true);
    this.clearSystemMessage();
    this.clearConversationError();
    this.refs.landingOverlay?.classList.remove("hidden");
    this.showLandingScreen();
    this.refs.conversationScreen?.classList.add("hidden");
    this.refs.conversationInput?.classList.add("hidden");
    this.refs.appShell?.classList.add("hidden");
    this.refs.dashboard?.classList.add("hidden");
    this.inManagementMode = false;
    this.setConversationCollapseEnabled(false);
    this.conversationSteps = this.createConversationSteps();
    this.resetConversation();
    this.conversationIndex = 0;
    this.conversationAdvanceVisible = true;
    this.applyConversationAdvanceVisibility();
    this.renderCanvasPlaceholder();
    this.updateHeader();
    this.updateControlStates();
  }

  showRulesScreen() {
    this.refs.landingScreen?.classList.add("hidden");
    if (this.refs.rulesScreen) {
      this.refs.rulesScreen.classList.remove("hidden");
      this.refs.rulesScreen.setAttribute("aria-hidden", "false");
    }
  }

  showLandingScreen() {
    if (this.refs.rulesScreen) {
      this.refs.rulesScreen.classList.add("hidden");
      this.refs.rulesScreen.setAttribute("aria-hidden", "true");
    }
    this.refs.landingScreen?.classList.remove("hidden");
    this.updateLandingContinueState();
  }

  updateLandingContinueState() {
    const button = this.refs.continueBtn;
    if (!button) {
      return;
    }
    const hasSaveSlots =
      typeof this.simulation.hasAnySaveData === "function" && this.simulation.hasAnySaveData();
    button.disabled = !hasSaveSlots;
    button.setAttribute("aria-disabled", hasSaveSlots ? "false" : "true");
    if (hasSaveSlots) {
      button.removeAttribute("title");
    } else {
      button.setAttribute("title", "セーブデータがありません");
    }
  }

  handleConversationAdvance() {
    this.clearConversationError();
    const step = this.conversationSteps[this.conversationIndex];
    if (!step) {
      return;
    }

    if (step.type === "input") {
      const inputEl = this.refs.conversationInput?.querySelector("input");
      const value = inputEl?.value.trim() ?? "";
      if (!value) {
        this.setConversationError(step.errorMessage || "入力してください。");
        inputEl?.focus();
        return;
      }
      this.conversationState[step.field] = value;
      this.advanceConversationIndex();
      return;
    }

    if (step.type === "select") {
      const selectEl = this.refs.conversationInput?.querySelector("select");
      const value = selectEl?.value ?? "";
      if (!value) {
        this.setConversationError("選択肢を選んでください。");
        return;
      }
      this.conversationState[step.field] = value;
      this.advanceConversationIndex();
      return;
    }

    if (step.type === "compoundName") {
      const prefixInput = this.refs.conversationInput?.querySelector(`[data-field="${step.fieldPrefix}"]`);
      const suffixSelect = this.refs.conversationInput?.querySelector(`[data-field="${step.fieldSuffix}"]`);
      const prefixValue = prefixInput?.value.trim() ?? "";
      const suffixValue = suffixSelect?.value ?? "";
      if (!prefixValue) {
        this.setConversationError(step.errorMessage || "塾名の接頭辞を入力してください。");
        prefixInput?.focus();
        return;
      }
      if (!suffixValue) {
        this.setConversationError("塾名の接尾辞を選択してください。");
        suffixSelect?.focus();
        return;
      }
      this.conversationState[step.fieldPrefix] = prefixValue;
      this.conversationState[step.fieldSuffix] = suffixValue;
      this.advanceConversationIndex();
      return;
    }

    if (step.type === "campusSelect") {
      const selectedId = this.conversationState[step.field];
      if (!selectedId) {
        this.setConversationError("開校する校舎を選択してください。");
        return;
      }
      this.advanceConversationIndex();
      return;
    }

    if (step.type === "teacherSelect") {
      const selectedTeacherId = this.conversationState[step.field];
      if (!selectedTeacherId) {
        this.setConversationError("採用する先生を選択してください。");
        return;
      }
      this.advanceConversationIndex();
      return;
    }

    if (step.type === "final") {
      this.startGameFromConversation();
      return;
    }

    this.advanceConversationIndex();
  }

  advanceConversationIndex() {
    this.conversationIndex = Math.min(this.conversationIndex + 1, this.conversationSteps.length - 1);
    this.renderConversationStep();
  }

  startGameFromConversation() {
    this.clearConversationError();
    const { playerName, schoolPrefix, schoolSuffix, initialCampusId, initialTeacherId } = this.conversationState;
    if (!playerName || !schoolPrefix || !schoolSuffix) {
      this.setConversationError("必要な情報が不足しています。");
      return;
    }
    if (!initialCampusId) {
      this.setConversationError("最初に開校する校舎を選択してください。");
      return;
    }
    if (!initialTeacherId) {
      this.setConversationError("1人目の先生を選択してください。");
      return;
    }
    const schoolName = `${schoolPrefix}${schoolSuffix}`;
    const initialCampus = this.simulation.startNewGame(playerName, schoolName, initialCampusId, {
      initialTeacherTemplateId: initialTeacherId,
    });
    this.activeCampusId = initialCampus?.id ?? null;
    this.enterManagementMode();
    this.setConversationLine(this.composeManagementMessage(null));
    this.refreshUI();
  }

  handleOpenCampus() {
    if (!this.simulation.hasActiveGame()) {
      this.showSystemMessage("ゲーム開始後に開校できます。");
      return;
    }

    const available = this.simulation.getAvailableCampusDefs();
    if (!available.length) {
      this.showSystemMessage("開校可能な校舎はありません。");
      return;
    }

    const currentFunds = this.simulation.player?.funds ?? 0;
    const campusOptions = available.map((campus) => ({
      value: campus.id,
      label: campus.name,
      marketStudents: campus.marketStudents,
      stationTraffic: campus.stationTraffic,
      rent: campus.rent,
      openingCost: campus.openingCost,
      intakeCapacity: campus.intakeCapacity,
      imageSrc: this.getCampusThumbnail(campus.id),
      affordable: currentFunds >= campus.openingCost,
    }));

    const teacherOptions = this.simulation.teacherTemplates.map((teacher) => ({
      value: teacher.id,
      label: teacher.name,
      rank: teacher.rank,
      baseSalary: teacher.baseSalary,
      satisfactionImpact: teacher.satisfactionImpact,
      gender: teacher.gender,
      specialty: teacher.specialty,
      personality: teacher.personality,
      portrait: this.getTeacherPortrait(teacher.templateId || teacher.id),
    }));

    const selection = { campusId: "", teacherId: "" };

    const modal = document.createElement("div");
    modal.className = "modal open-campus-modal";
    modal.innerHTML = `
      <div class="modal-head">
        <h3>新規開校</h3>
        <p class="muted">所持資金: ${this.formatYen(currentFunds)} ／ 家賃水準に応じて400万〜800万円の初期投資が必要です。</p>
      </div>
      <div class="open-campus-step" data-step="campus">
        <div class="open-campus-step-head">
          <h4>1. 校舎を選択</h4>
          <span>未開校の校舎カードから選択してください。</span>
        </div>
        <div class="campus-card-grid-wrapper">
          <div class="campus-card-grid" data-role="open-campus-grid"></div>
        </div>
      </div>
      <div class="open-campus-step" data-step="teacher">
        <div class="open-campus-step-head">
          <h4>2. 初期の先生を決定</h4>
          <span>開校時に着任する先生を選びましょう。</span>
        </div>
        <div class="campus-card-grid-wrapper">
          <div class="campus-card-grid teacher-card-grid" data-role="open-teacher-grid"></div>
        </div>
        <p class="muted helper">※ 校舎を選ぶと選択できるようになります。</p>
      </div>
      <div class="modal-actions spaced">
        <button class="secondary" data-dismiss="true">閉じる</button>
        <button class="primary" data-action="confirm" disabled>この条件で開校する</button>
      </div>
    `;

    const campusGrid = modal.querySelector('[data-role="open-campus-grid"]');
    const teacherGrid = modal.querySelector('[data-role="open-teacher-grid"]');
    const confirmBtn = modal.querySelector('[data-action="confirm"]');
    const teacherStep = modal.querySelector('[data-step="teacher"]');
    const teacherHelper = teacherStep?.querySelector(".helper");

    const renderCampusCards = () => {
      if (!campusGrid) {
        return;
      }
      campusGrid.innerHTML = "";
      campusOptions.forEach((option) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "campus-card";
        if (!option.affordable) {
          card.disabled = true;
          card.classList.add("disabled");
        }
        if (selection.campusId === option.value) {
          card.classList.add("selected");
        }

        const media = document.createElement("div");
        media.className = "campus-card-media";
        const image = document.createElement("img");
        image.src = option.imageSrc;
        image.alt = `${option.label}の外観イメージ`;
        media.appendChild(image);

        const content = document.createElement("div");
        content.className = "campus-card-content";
        content.innerHTML = `
          <p class="campus-name">${option.label}</p>
          <p class="campus-meta">商圏: ${option.marketStudents.toLocaleString()}人</p>
          <p class="campus-meta">家賃: ${this.formatMonthlyRent(option.rent)}</p>
          <p class="campus-meta">駅乗降客数: ${option.stationTraffic}万人/日</p>
          <p class="campus-meta">受入上限: ${this.formatIntakeCapacity(option.intakeCapacity)}</p>
          <p class="campus-meta">初期投資: ${this.formatYen(option.openingCost)}</p>
        `;

        if (!option.affordable) {
          const badge = document.createElement("span");
          badge.className = "campus-badge";
          badge.textContent = "資金不足";
          media.appendChild(badge);
        }

        card.append(media, content);

        card.addEventListener("click", () => {
          if (!option.affordable) {
            return;
          }
          selection.campusId = option.value;
          renderCampusCards();
          renderTeacherCards();
          updateTeacherStepState();
          updateConfirmState();
        });

        campusGrid.appendChild(card);
      });
    };

    const renderTeacherCards = () => {
      if (!teacherGrid) {
        return;
      }
      teacherGrid.innerHTML = "";
      teacherOptions.forEach((option) => {
        const disabled = !selection.campusId;
        const card = document.createElement("button");
        card.type = "button";
        card.className = "campus-card teacher-card";
        if (disabled) {
          card.disabled = true;
          card.classList.add("disabled");
        }
        if (selection.teacherId === option.value) {
          card.classList.add("selected");
        }

        const portraitWrapper = document.createElement("div");
        portraitWrapper.className = "teacher-portrait";
        const portrait = document.createElement("img");
        portrait.src = option.portrait;
        portrait.alt = `${option.label}のアイコン`;
        portrait.width = 400;
        portrait.height = 400;
        portraitWrapper.appendChild(portrait);

        const content = document.createElement("div");
        content.className = "teacher-card-content";
        const name = document.createElement("p");
        name.className = "teacher-name";
        name.textContent = option.label;
        const subtitle = document.createElement("p");
        subtitle.className = "teacher-meta";
        const genderLabel = option.gender === "female" ? "女性" : option.gender === "male" ? "男性" : "-";
        subtitle.textContent = `${this.renderRankLabel(option.rank)} / ${genderLabel}`;
        const specialty = document.createElement("p");
        specialty.className = "teacher-specialty";
        specialty.textContent = option.specialty ? `専門: ${option.specialty}` : "";
        const salary = document.createElement("p");
        salary.className = "teacher-meta";
        salary.textContent = `月給: ${option.baseSalary.toLocaleString()}円`;
        const personality = document.createElement("p");
        personality.className = "teacher-meta teacher-personality";
        personality.textContent = option.personality ? `性格: ${option.personality}` : "性格: 不明";

        if (option.specialty) {
          content.append(name, subtitle, specialty, salary, personality);
        } else {
          content.append(name, subtitle, salary, personality);
        }

        card.append(portraitWrapper, content);

        card.addEventListener("click", () => {
          if (disabled) {
            return;
          }
          selection.teacherId = option.value;
          renderTeacherCards();
          updateConfirmState();
        });

        teacherGrid.appendChild(card);
      });
    };

    const updateTeacherStepState = () => {
      const inactive = !selection.campusId;
      teacherStep?.classList.toggle("inactive", inactive);
      if (teacherHelper) {
        teacherHelper.classList.toggle("hidden", !inactive);
      }
    };

    const updateConfirmState = () => {
      confirmBtn.disabled = !(selection.campusId && selection.teacherId);
    };

    renderCampusCards();
    renderTeacherCards();
    updateTeacherStepState();
    updateConfirmState();

    modal.addEventListener("click", (event) => {
      const dismiss = event.target.closest("button[data-dismiss]");
      if (dismiss) {
        this.hideModal();
      }
    });

    confirmBtn.addEventListener("click", () => {
      if (!selection.campusId || !selection.teacherId) {
        return;
      }
      try {
        const campus = this.simulation.openNewCampus(selection.campusId, {
          initialTeacherTemplateId: selection.teacherId,
        });
        this.activeCampusId = campus.id;
        this.hideModal();
        this.refreshUI();
        this.announceNewCampus(campus);
      } catch (error) {
        this.showModalError(modal, error.message);
      }
    });

    this.showModal(modal);
  }

  announceNewCampus(campus) {
    if (!campus) {
      return;
    }
    const leadTeacher = campus.teachers?.[0];
    const teacherLine = leadTeacher ? `${leadTeacher.name}先生が初期クラスを担当します。` : "";
    const estimatedStudents = campus.studentCount?.toLocaleString?.() || "-";
    const message = `おめでとうございます！${campus.name}の開校手続きが完了しました。初月はおよそ${estimatedStudents}人からのスタートになりそうです。${teacherLine}`;
    this.setConversationLine(message.trim());
  }

  handleToggleAd() {
    if (!this.simulation.hasActiveGame()) {
      return;
    }
    const campus = this.getActiveCampus();
    if (!campus) {
      this.showSystemMessage("校舎を選択してください。");
      return;
    }
    const plans = this.simulation.getAdPlans();
    const modal = document.createElement("div");
    modal.className = "modal ad-plan-modal";
    const planCards = plans
      .map((plan) => {
        const effectPercent = Math.round(plan.effect * 100);
        const active = campus.adPlan?.id === plan.id;
        const pending = campus.nextAdPlan?.id === plan.id;
        let status = "";
        if (pending) {
          status = "来月から適用予定";
        } else if (active) {
          status = "適用中";
        }
        const statusClass = pending ? " is-pending" : active ? " is-active" : "";
        return `
          <button class="ad-plan-card${statusClass}" data-plan-id="${plan.id}">
            <div class="ad-plan-card-header">
              <p class="ad-plan-name">${plan.label}</p>
              <p class="ad-plan-cost">${plan.cost.toLocaleString()}円/月</p>
            </div>
            <p class="ad-plan-effect">流入補正 +${effectPercent}%</p>
            ${plan.description ? `<p class="ad-plan-description">${plan.description}</p>` : ""}
            ${status ? `<span class="ad-plan-status">${status}</span>` : ""}
          </button>`;
      })
      .join("");
    modal.innerHTML = `
      <h3>広告プランを選択</h3>
      <p>選択した広告は次の月から費用と効果が反映されます。</p>
      <div class="ad-plan-grid">
        ${planCards}
      </div>
      <p class="ad-plan-note">※プラン変更は決定した翌月から自動で反映されます。</p>
      <div class="modal-actions">
        <button class="secondary" data-dismiss="true">閉じる</button>
      </div>
    `;

    modal.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) {
        return;
      }
      if (target.dataset.dismiss) {
        this.hideModal();
        return;
      }
      const planId = target.dataset.planId;
      try {
        const result = this.simulation.scheduleAdPlan(campus.id, planId);
        this.hideModal();
        this.refreshUI();
        if (result.nextPlan) {
          this.showSystemMessage(`「${result.nextPlan.label}」は次の月から適用されます。`, "info");
        } else {
          this.showSystemMessage("選択したプランはすでに適用中です。", "info");
        }
      } catch (error) {
        this.showModalError(modal, error.message);
      }
    });

    this.showModal(modal);
  }

  handleSave() {
    if (!this.simulation.hasActiveGame()) {
      this.showSystemMessage("ゲーム開始後にセーブできます。");
      return;
    }
    this.openSaveSlotModal("save");
  }

  handleLoad() {
    this.openSaveSlotModal("load");
  }

  handleContinueFromLanding() {
    const hasSaveSlots =
      typeof this.simulation.hasAnySaveData === "function" && this.simulation.hasAnySaveData();
    if (!hasSaveSlots) {
      this.showSystemMessage("セーブデータが見つかりません。", "info");
      return;
    }
    this.openSaveSlotModal("load");
  }

  openSaveSlotModal(mode) {
    const isSaveMode = mode === "save";
    if (isSaveMode && !this.simulation.hasActiveGame()) {
      this.showSystemMessage("ゲーム開始後にセーブできます。");
      return;
    }
    const slots =
      typeof this.simulation.listSaveSlots === "function"
        ? this.simulation.listSaveSlots()
        : [];
    const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
    const modal = document.createElement("div");
    modal.className = "modal save-slot-modal";
    const hasAnyData = slots.some((slot) => slot.hasData);
    const title = isSaveMode ? "セーブスロットを選択" : "ロードするスロットを選択";
    const helper = isSaveMode
      ? "保存先を選んでください。同じスロットを選ぶと上書きされます。"
      : hasAnyData
      ? "ロードしたいスロットを選択してください。"
      : "セーブデータがありません。";
    modal.innerHTML = `
      <h3>${title}</h3>
      <p class="save-slot-note">${helper}</p>
      <div class="save-slot-grid">
        ${slots.map((slot) => this.renderSaveSlotCard(slot, mode)).join("")}
      </div>
      <div class="modal-actions">
        <button class="secondary" data-dismiss="true">閉じる</button>
      </div>
    `;

    modal.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) {
        return;
      }
      if (target.dataset.dismiss) {
        this.hideModal();
        return;
      }
      const slotId = target.dataset.slotId;
      if (!slotId) {
        return;
      }
      const slotInfo = slotMap.get(slotId);
      if (isSaveMode) {
        this.handleSaveSlotSelection(slotId, modal, slotInfo);
      } else {
        this.handleLoadSlotSelection(slotId, modal, slotInfo);
      }
    });

    this.showModal(modal);
  }

  renderSaveSlotCard(slot, mode) {
    const summary = slot?.summary ?? null;
    const hasData = Boolean(slot?.hasData && summary);
    const isCorrupted = Boolean(slot?.hasData && !summary);
    const slotId = slot?.id ?? "?";
    const label = `スロット ${slotId}`;
    let body = "";
    if (hasData && summary) {
      const fundsLabel = `${this.formatMillionYen(summary.funds)}万円`;
      body = `
        <p class="save-slot-title">${summary.schoolName}</p>
        <p class="save-slot-sub">${summary.playerName} / ${this.formatDate(summary.year, summary.month)}</p>
        <p class="save-slot-meta">資金 ${fundsLabel} ・ 校舎 ${summary.campusCount}校</p>
      `;
    } else if (isCorrupted) {
      body = `<p class="save-slot-empty">データを読み込めません。</p>`;
    } else {
      body = `<p class="save-slot-empty">セーブデータがありません。</p>`;
    }
    const timestamp = hasData && summary?.savedAt ? this.formatSaveTimestamp(summary.savedAt) : "空きスロット";
    const modeHint = !hasData && mode === "load" ? `<span class="save-slot-hint">ロード不可</span>` : "";
    const stateClass = hasData ? "" : " empty";
    return `
      <button class="save-slot-card${stateClass}" type="button" data-slot-id="${slotId}">
        <div class="save-slot-head">
          <span class="save-slot-label">${label}</span>
          <span class="save-slot-timestamp">${timestamp}</span>
        </div>
        <div class="save-slot-body">
          ${body}
          ${modeHint}
        </div>
      </button>
    `;
  }

  handleSaveSlotSelection(slotId, modal, slotInfo = null) {
    if (!this.simulation.hasActiveGame()) {
      this.showModalError(modal, "ゲーム開始後にセーブできます。");
      return;
    }
    const info = slotInfo ?? this.simulation.getSaveSlotInfo?.(slotId);
    if (info?.hasData && info.summary) {
      this.showOverwriteConfirmation(modal, slotId, info.summary, () => this.performSaveToSlot(slotId, modal));
      return;
    }
    this.performSaveToSlot(slotId, modal);
  }

  performSaveToSlot(slotId, modal) {
    const result = this.simulation.saveToStorage(slotId);
    if (!result) {
      this.showModalError(modal, "セーブに失敗しました。");
      return;
    }
    this.hideModal();
    this.showSystemMessage(`スロット${slotId}にセーブしました。`, "success");
    this.updateLandingContinueState();
  }

  handleLoadSlotSelection(slotId, modal, slotInfo = null) {
    const info = slotInfo ?? this.simulation.getSaveSlotInfo?.(slotId);
    if (!info?.hasData || !info.summary) {
      this.showModalError(modal, `スロット${slotId}にセーブデータがありません。`);
      return;
    }
    const loaded = this.simulation.loadFromStorage(slotId);
    if (!loaded) {
      this.showModalError(modal, "ロードに失敗しました。");
      return;
    }
    this.activeCampusId = this.simulation.player?.campuses[0]?.id ?? null;
    this.refs.landingOverlay?.classList.add("hidden");
    this.enterManagementMode();
    this.setConversationLine("セーブデータを読み込みました。経営状況を確認してください。");
    this.showSystemMessage(`スロット${slotId}からロードしました。`, "success");
    this.refreshUI();
    this.hideModal();
    this.updateLandingContinueState();
  }

  showOverwriteConfirmation(modal, slotId, summary, onConfirm) {
    if (!modal) {
      return;
    }
    this.dismissSaveSlotConfirm(modal);
    const overlay = document.createElement("div");
    overlay.className = "save-slot-confirm";
    const fundsLabel = `${this.formatMillionYen(summary.funds ?? 0)}万円`;
    const saveDate = summary.savedAt ? this.formatSaveTimestamp(summary.savedAt) : "日時不明";
    overlay.innerHTML = `
      <div class="save-slot-confirm-panel" role="dialog" aria-modal="true">
        <h4>スロット${slotId}を上書きしますか？</h4>
        <p>現在のデータは下記の内容です。上書きすると元に戻せません。</p>
        <ul class="save-slot-confirm-summary">
          <li><span>塾名</span><strong>${summary.schoolName}</strong></li>
          <li><span>プレイヤー</span><strong>${summary.playerName}</strong></li>
          <li><span>年月</span><strong>${this.formatDate(summary.year, summary.month)}</strong></li>
          <li><span>資金</span><strong>${fundsLabel}</strong></li>
          <li><span>保存日時</span><strong>${saveDate}</strong></li>
        </ul>
        <div class="save-slot-confirm-actions">
          <button class="secondary" type="button" data-action="cancel">キャンセル</button>
          <button class="primary" type="button" data-action="confirm">上書き保存する</button>
        </div>
      </div>
    `;

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        this.dismissSaveSlotConfirm(modal);
        return;
      }
      const action = event.target.closest("button")?.dataset.action;
      if (!action) {
        return;
      }
      if (action === "cancel") {
        this.dismissSaveSlotConfirm(modal);
        return;
      }
      if (action === "confirm") {
        this.dismissSaveSlotConfirm(modal);
        onConfirm?.();
      }
    });

    modal.appendChild(overlay);
  }

  dismissSaveSlotConfirm(modal) {
    if (!modal) {
      return;
    }
    const overlay = modal.querySelector(".save-slot-confirm");
    if (overlay) {
      overlay.remove();
    }
  }

  getActiveCampus() {
    if (!this.simulation.player) {
      return null;
    }
    if (this.activeCampusId) {
      const campus = this.simulation.player.campuses.find((c) => c.id === this.activeCampusId);
      if (campus) {
        return campus;
      }
    }
    return this.simulation.player.campuses[0] || null;
  }

  refreshUI() {
    this.updateHeader();
    this.updatePriorityMetrics();
    this.renderTabs();
    this.renderCampusDetail();
    this.renderGraph();
    this.updateControlStates();
  }

  renderConversationStep() {
    const step = this.conversationSteps[this.conversationIndex];
    if (!step || !this.refs.conversationLine) {
      return;
    }

    this.setConversationAdvanceVisibility(true);

    const message = step.type === "textTemplate" ? step.template(this.conversationState) : step.message;
    this.setConversationLine(message);
    if (this.refs.conversationInput) {
      this.refs.conversationInput.innerHTML = "";
    }
    this.clearConversationError();

    const advanceLabel = this.getConversationButtonLabel(step);
    if (this.refs.conversationNextLabel) {
      this.refs.conversationNextLabel.textContent = advanceLabel;
    }
    if (this.refs.conversationNext) {
      this.refs.conversationNext.setAttribute("aria-label", advanceLabel);
    }

    if (step.type === "input") {
      this.renderInputField(step);
    } else if (step.type === "select") {
      this.renderSelectField(step);
    } else if (step.type === "compoundName") {
      this.renderCompoundNameField(step);
    } else if (step.type === "campusSelect") {
      this.renderCampusSelect(step);
    } else if (step.type === "teacherSelect") {
      this.renderTeacherSelect(step);
    } else if (step.type === "final") {
      this.renderConversationSummary();
    }
  }

  renderInputField(step) {
    if (!this.refs.conversationInput) {
      return;
    }
    const field = document.createElement("div");
    field.className = "conversation-field";
    const label = document.createElement("label");
    label.textContent = step.label;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = step.placeholder || "";
    input.value = this.conversationState[step.field] || "";
    if (step.maxLength) {
      input.maxLength = step.maxLength;
    }
    label.appendChild(input);

    if (step.maxLength) {
      const helper = document.createElement("span");
      helper.className = "input-helper-text";
      helper.textContent = `${step.maxLength}文字以内で入力してください`;
      label.appendChild(helper);
    }

    field.appendChild(label);

    if (step.inlineConfirm) {
      field.appendChild(this.createInlineConfirmRow(step.inlineConfirmLabel || "決定"));
      this.setConversationAdvanceVisibility(false);
    }

    this.refs.conversationInput.appendChild(field);
    input.focus();
  }

  renderSelectField(step) {
    if (!this.refs.conversationInput) {
      return;
    }
    const label = document.createElement("label");
    label.textContent = step.label;
    const select = document.createElement("select");
    step.options.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      opt.selected = (this.conversationState[step.field] || SUFFIX_OPTIONS[0].value) === option.value;
      select.appendChild(opt);
    });
    label.appendChild(select);
    this.refs.conversationInput.appendChild(label);
  }

  renderCompoundNameField(step) {
    if (!this.refs.conversationInput) {
      return;
    }

    const row = document.createElement("div");
    row.className = "name-row";

    const prefixField = document.createElement("div");
    prefixField.className = "name-field";
    const prefixLabel = document.createElement("label");
    prefixLabel.textContent = step.labelPrefix;
    const prefixInput = document.createElement("input");
    prefixInput.type = "text";
    prefixInput.placeholder = step.placeholder || "";
    prefixInput.value = this.conversationState[step.fieldPrefix] || "";
    prefixInput.dataset.field = step.fieldPrefix;
    if (step.maxLength) {
      prefixInput.maxLength = step.maxLength;
    }
    prefixField.append(prefixLabel, prefixInput);

    if (step.maxLength) {
      const helper = document.createElement("span");
      helper.className = "input-helper-text";
      helper.textContent = `${step.maxLength}文字以内`;
      prefixField.appendChild(helper);
    }

    const suffixField = document.createElement("div");
    suffixField.className = "name-field";
    const suffixLabel = document.createElement("label");
    suffixLabel.textContent = step.labelSuffix;
    const suffixSelect = document.createElement("select");
    suffixSelect.dataset.field = step.fieldSuffix;
    step.options.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      opt.selected = (this.conversationState[step.fieldSuffix] || SUFFIX_OPTIONS[0].value) === option.value;
      suffixSelect.appendChild(opt);
    });
    suffixField.append(suffixLabel, suffixSelect);

    row.append(prefixField, suffixField);
    const container = document.createElement("div");
    container.className = "conversation-field";
    container.appendChild(row);

    if (step.inlineConfirm) {
      container.appendChild(this.createInlineConfirmRow(step.inlineConfirmLabel || "決定"));
      this.setConversationAdvanceVisibility(false);
    }

    this.refs.conversationInput.appendChild(container);
    prefixInput.focus();
  }

  createInlineConfirmRow(labelText) {
    const row = document.createElement("div");
    row.className = "conversation-action-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-confirm";
    button.textContent = labelText;
    button.addEventListener("click", () => this.handleConversationAdvance());
    row.appendChild(button);
    return row;
  }

  renderCampusSelect(step) {
    if (!this.refs.conversationInput) {
      return;
    }

    const heading = document.createElement("label");
    heading.className = "field-label";
    heading.textContent = step.label;
    this.refs.conversationInput.appendChild(heading);

    const options = step.options || [];
    if (!options.length) {
      const empty = document.createElement("p");
      empty.textContent = "選択できる校舎がありません";
      this.refs.conversationInput.appendChild(empty);
      return;
    }

    const pageSize = step.pageSize || 4;
    const totalPages = Math.max(1, Math.ceil(options.length / pageSize));
    let currentPage = this.getPagination(step.id);
    if (currentPage > totalPages - 1) {
      currentPage = totalPages - 1;
    }
    if (currentPage < 0) {
      currentPage = 0;
    }
    this.setPagination(step.id, currentPage);

    const start = currentPage * pageSize;
    const pageOptions = options.slice(start, start + pageSize);

    const selectedValue = this.conversationState[step.field];
    const selectedOption = options.find((opt) => opt.value === selectedValue);
    if (selectedOption && selectedOption.affordable === false) {
      this.conversationState[step.field] = "";
    }

    const gridWrapper = document.createElement("div");
    gridWrapper.className = "campus-card-grid-wrapper";
    const grid = document.createElement("div");
    grid.className = "campus-card-grid";
    let confirmButtonRef = null;

    pageOptions.forEach((option) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "campus-card";
      card.dataset.value = option.value;
      const isAffordable = option.affordable ?? true;
      if (this.conversationState[step.field] === option.value) {
        card.classList.add("selected");
      }
      if (!isAffordable) {
        card.disabled = true;
        card.classList.add("disabled");
      }

      const media = document.createElement("div");
      media.className = "campus-card-media";
      const image = document.createElement("img");
      image.src = option.imageSrc;
      image.alt = `${option.label}の外観イメージ`;
      media.appendChild(image);

      const content = document.createElement("div");
      content.className = "campus-card-content";
      const name = document.createElement("p");
      name.className = "campus-name";
      name.textContent = option.label;
      const market = document.createElement("p");
      market.className = "campus-meta";
      market.textContent = `商圏: ${option.marketStudents.toLocaleString()}人`;
      const rent = document.createElement("p");
      rent.className = "campus-meta";
      rent.textContent = `家賃: ${this.formatMonthlyRent(option.rent)}`;
      const station = document.createElement("p");
      station.className = "campus-meta";
      station.textContent = `駅乗降客数: ${option.stationTraffic}万人/日`;
      const cost = document.createElement("p");
      cost.className = "campus-meta";
      cost.textContent = `初期投資: ${this.formatYen(option.openingCost)}`;
      const capacity = document.createElement("p");
      capacity.className = "campus-meta";
      capacity.textContent = `受入上限: ${this.formatIntakeCapacity(option.intakeCapacity)}`;
      content.append(name, market, rent, station, capacity, cost);

      if (!isAffordable) {
        const badge = document.createElement("span");
        badge.className = "campus-badge";
        badge.textContent = "資金不足";
        media.appendChild(badge);
      }

      card.append(media, content);

      card.addEventListener("click", () => {
        if (!isAffordable) {
          return;
        }
        this.conversationState[step.field] = option.value;
        Array.from(grid.children).forEach((child) => child.classList.remove("selected"));
        card.classList.add("selected");
        if (confirmButtonRef) {
          confirmButtonRef.disabled = false;
        }
      });

      grid.appendChild(card);
    });

    gridWrapper.appendChild(grid);
    this.refs.conversationInput.appendChild(gridWrapper);

    const { footer, confirmBtn } = this.buildSelectionFooter({
      stepId: step.id,
      currentPage,
      totalPages,
      confirmLabel: step.confirmLabel || "この校舎に決める",
      confirmDisabled: !this.conversationState[step.field],
      onConfirm: () => this.handleConversationAdvance(),
    });
    confirmButtonRef = confirmBtn;
    this.refs.conversationInput.appendChild(footer);
  }

  renderTeacherSelect(step) {
    if (!this.refs.conversationInput) {
      return;
    }

    const heading = document.createElement("label");
    heading.className = "field-label";
    heading.textContent = step.label;
    this.refs.conversationInput.appendChild(heading);

    const options = step.options || [];
    if (!options.length) {
      const empty = document.createElement("p");
      empty.textContent = "選択可能な先生データがありません";
      this.refs.conversationInput.appendChild(empty);
      return;
    }

    const pageSize = step.pageSize || 4;
    const totalPages = Math.max(1, Math.ceil(options.length / pageSize));
    let currentPage = this.getPagination(step.id);
    if (currentPage > totalPages - 1) {
      currentPage = totalPages - 1;
    }
    if (currentPage < 0) {
      currentPage = 0;
    }
    this.setPagination(step.id, currentPage);

    const start = currentPage * pageSize;
    const pageOptions = options.slice(start, start + pageSize);

    const gridWrapper = document.createElement("div");
    gridWrapper.className = "campus-card-grid-wrapper";
    const grid = document.createElement("div");
    grid.className = "campus-card-grid teacher-card-grid";
    let confirmButtonRef = null;

    pageOptions.forEach((option) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "campus-card teacher-card";
      card.dataset.value = option.value;
      if (this.conversationState[step.field] === option.value) {
        card.classList.add("selected");
      }

      const portraitWrapper = document.createElement("div");
      portraitWrapper.className = "teacher-portrait";
      const portrait = document.createElement("img");
      portrait.src = option.portrait;
      portrait.alt = `${option.label}のアイコン`;
      portrait.width = 400;
      portrait.height = 400;
      portraitWrapper.appendChild(portrait);

      const content = document.createElement("div");
      content.className = "teacher-card-content";

      const name = document.createElement("p");
      name.className = "teacher-name";
      name.textContent = option.label;

      const subtitle = document.createElement("p");
      subtitle.className = "teacher-meta";
      let genderLabel = "性別";
      if (option.gender === "female") {
        genderLabel = "女性";
      } else if (option.gender === "male") {
        genderLabel = "男性";
      } else {
        genderLabel = "-";
      }
      subtitle.textContent = `${this.renderRankLabel(option.rank)} / ${genderLabel}`;

      const specialty = document.createElement("p");
      specialty.className = "teacher-specialty";
      specialty.textContent = option.specialty ? `専門: ${option.specialty}` : "";

      const salary = document.createElement("p");
      salary.className = "teacher-meta";
      salary.textContent = `月給: ${option.baseSalary.toLocaleString()}円`;

      const personality = document.createElement("p");
      personality.className = "teacher-meta teacher-personality";
      personality.textContent = option.personality ? `性格: ${option.personality}` : "性格: 不明";

      if (option.specialty) {
        content.append(name, subtitle, specialty, salary, personality);
      } else {
        content.append(name, subtitle, salary, personality);
      }

      card.append(portraitWrapper, content);

      card.addEventListener("click", () => {
        this.conversationState[step.field] = option.value;
        Array.from(grid.children).forEach((child) => child.classList.remove("selected"));
        card.classList.add("selected");
        if (confirmButtonRef) {
          confirmButtonRef.disabled = false;
        }
      });

      grid.appendChild(card);
    });

    gridWrapper.appendChild(grid);
    this.refs.conversationInput.appendChild(gridWrapper);

    const { footer, confirmBtn } = this.buildSelectionFooter({
      stepId: step.id,
      currentPage,
      totalPages,
      confirmLabel: step.confirmLabel || "この先生に決める",
      confirmDisabled: !this.conversationState[step.field],
      onConfirm: () => this.handleConversationAdvance(),
    });
    confirmButtonRef = confirmBtn;
    this.refs.conversationInput.appendChild(footer);
  }

  buildSelectionFooter({ stepId, currentPage, totalPages, confirmLabel, confirmDisabled, onConfirm }) {
    this.setConversationAdvanceVisibility(false);
    const footer = document.createElement("div");
    footer.className = "selection-footer";

    const pagination = totalPages > 1
      ? this.createPaginationControls(stepId, currentPage, totalPages)
      : this.createPaginationPlaceholder();
    footer.appendChild(pagination);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "selection-confirm";
    confirmBtn.textContent = confirmLabel;
    confirmBtn.disabled = confirmDisabled;
    confirmBtn.addEventListener("click", () => {
      if (confirmBtn.disabled) {
        return;
      }
      onConfirm();
    });

    footer.appendChild(confirmBtn);
    return { footer, confirmBtn };
  }

  createPaginationPlaceholder() {
    const placeholder = document.createElement("div");
    placeholder.className = "card-pagination pagination-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }

  createPaginationControls(stepId, currentPage, totalPages) {
    const nav = document.createElement("div");
    nav.className = "card-pagination";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "pagination-button is-prev";
    prev.setAttribute("aria-label", "前の候補を見る");
    prev.innerHTML = `
      <span class="sr-only">前の候補を見る</span>
      <svg class="pagination-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M15.5 5.5 8 12l7.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
    prev.disabled = currentPage === 0;
    prev.addEventListener("click", (event) => {
      event.preventDefault();
      if (currentPage === 0) {
        return;
      }
      this.setPagination(stepId, currentPage - 1);
      this.renderConversationStep();
    });

    const indicator = document.createElement("span");
    indicator.className = "pagination-indicator";
    indicator.textContent = `${currentPage + 1} / ${totalPages}`;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "pagination-button is-next";
    next.setAttribute("aria-label", "次の候補を見る");
    next.innerHTML = `
      <span class="sr-only">次の候補を見る</span>
      <svg class="pagination-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8.5 5.5 16 12l-7.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
    next.disabled = currentPage >= totalPages - 1;
    next.addEventListener("click", (event) => {
      event.preventDefault();
      if (currentPage >= totalPages - 1) {
        return;
      }
      this.setPagination(stepId, currentPage + 1);
      this.renderConversationStep();
    });

    nav.append(prev, indicator, next);
    return nav;
  }

  renderConversationSummary() {
    if (!this.refs.conversationInput) {
      return;
    }
    const summary = document.createElement("div");
    summary.className = "conversation-summary";
    const campusName = this.getCampusDisplayName(this.conversationState.initialCampusId);
    const teacherName = this.getTeacherDisplayName(this.conversationState.initialTeacherId);
    summary.innerHTML = `
      <div class="summary-header">
        <div class="summary-row">
          <span class="summary-label">プレイヤー名</span>
          <strong class="summary-value">${this.conversationState.playerName}</strong>
        </div>
        <div class="summary-row">
          <span class="summary-label">塾名</span>
          <strong class="summary-value">${this.conversationState.schoolPrefix}${this.conversationState.schoolSuffix}</strong>
        </div>
      </div>

      <div class="summary-grid">
        ${this.renderSummaryCampusCard(this.conversationState.initialCampusId)}
        ${this.renderSummaryTeacherCard(this.conversationState.initialTeacherId)}
      </div>
    `;
    this.refs.conversationInput.appendChild(summary);
  }

  renderSummaryCampusCard(campusId) {
    const campus = this.simulation.campusCatalog.find(c => c.id === campusId);
    if (!campus) return "";

    return `
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-badge">開校する校舎</span>
        </div>
        <img src="${this.getCampusThumbnail(campus.id)}" alt="" class="summary-card-image">
        <div class="summary-card-content">
          <p class="summary-card-title">${campus.name}</p>
          <div class="summary-card-stats">
            <p>商圏: ${campus.marketStudents.toLocaleString()}人</p>
            <p>乗降客数: ${campus.stationTraffic}万人</p>
            <p>初期投資: ${this.formatYen(campus.openingCost)}</p>
          </div>
        </div>
      </div>
    `;
  }

  renderSummaryTeacherCard(teacherId) {
    const teacher = this.simulation.teacherTemplates.find(t => t.id === teacherId);
    if (!teacher) return "";

    const portrait = this.getTeacherPortrait(teacher.templateId || teacher.id);

    return `
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-badge">担当する先生</span>
        </div>
        <div class="summary-card-portrait">
          <img src="${portrait}" alt="">
        </div>
        <div class="summary-card-content">
          <p class="summary-card-title">${teacher.name}</p>
          <div class="summary-card-stats">
            <p>${this.renderRankLabel(teacher.rank)} / ${teacher.gender === 'female' ? '女性' : '男性'}</p>
            <p>月給: ${teacher.baseSalary.toLocaleString()}円</p>
            <p>${teacher.specialty ? `専門: ${teacher.specialty}` : '専門なし'}</p>
          </div>
        </div>
      </div>
    `;
  }

  getConversationButtonLabel(step) {
    if (step.type === "input" || step.type === "select") {
      return "決定";
    }
    if (step.type === "compoundName") {
      return "決定";
    }
    if (step.type === "campusSelect") {
      return "決定";
    }
    if (step.type === "teacherSelect") {
      return "決定";
    }
    if (step.type === "final") {
      return "経営を開始する";
    }
    return "次へ";
  }

  resetConversation() {
    this.conversationIndex = 0;
    this.conversationState = this.createInitialConversationState();
    this.paginationState = {};
  }

  createInitialConversationState() {
    return {
      playerName: "",
      schoolPrefix: "",
      schoolSuffix: SUFFIX_OPTIONS[0].value,
      initialCampusId: "",
      initialTeacherId: "",
    };
  }

  estimateInitialStudents(campusId) {
    if (!campusId) {
      return null;
    }
    const campus = this.simulation.campusCatalog.find((c) => c.id === campusId);
    if (!campus || !campus.marketStudents) {
      return null;
    }
    return Math.max(1, Math.round(campus.marketStudents / INITIAL_STUDENT_DIVISOR));
  }

  getCampusDisplayName(campusId) {
    const campus = this.simulation.campusCatalog.find((c) => c.id === campusId);
    return campus ? campus.name : "";
  }

  getTeacherDisplayName(templateId) {
    if (!templateId) {
      return "";
    }
    const teacher = this.simulation.teacherTemplates.find((t) => t.id === templateId);
    return teacher ? teacher.name : "";
  }

  createConversationSteps() {
    const initialFunds = DEFAULT_FUNDS;
    const campusOptions = this.simulation.campusCatalog.map((campus) => ({
      value: campus.id,
      label: campus.name,
      marketStudents: campus.marketStudents,
      stationTraffic: campus.stationTraffic,
      rent: campus.rent,
      openingCost: campus.openingCost,
      intakeCapacity: campus.intakeCapacity,
      imageSrc: this.getCampusThumbnail(campus.id),
      affordable: initialFunds >= (campus.openingCost ?? 0),
    }));

    const teacherOptions = this.simulation.teacherTemplates.map((teacher) => ({
      value: teacher.id,
      label: teacher.name,
      rank: teacher.rank,
      baseSalary: teacher.baseSalary,
      satisfactionImpact: teacher.satisfactionImpact,
      gender: teacher.gender,
      specialty: teacher.specialty,
      personality: teacher.personality,
      portrait: this.getTeacherPortrait(teacher.templateId || teacher.id),
    }));

    return [
      {
        id: "greet1",
        type: "text",
        message: "ようこそフランチャイズ本部へ。お待ちしていました。",
      },
      {
        id: "greet2",
        type: "text",
        message: "わたくし、担当エージェントの佐伯と申します。",
      },
      {
        id: "askNameIntro",
        type: "text",
        message: "まずはあなたのお名前を再確認させてください。",
      },
      {
        id: "askName",
        type: "input",
        field: "playerName",
        label: "プレイヤー名",
        placeholder: "例: 山田太郎",
        maxLength: 8,
        errorMessage: "プレイヤー名を入力してください。",
        inlineConfirm: true,
        inlineConfirmLabel: "この名前で決定",
      },
      {
        id: "confirmName",
        type: "textTemplate",
        template: (state) => `ありがとうございます、${state.playerName}オーナー。ですね`,
      },
      {
        id: "forgotName",
        type: "text",
        message: "実は……加盟される塾の名前を、私ど忘れしてしまいまして……。",
      },
      {
        id: "askReminder",
        type: "text",
        message: "あなたが加盟する予定の塾の名前って、なんでしたっけ？",
      },
      {
        id: "askSchoolName",
        type: "compoundName",
        fieldPrefix: "schoolPrefix",
        fieldSuffix: "schoolSuffix",
        labelPrefix: "塾名（接頭辞）",
        labelSuffix: "塾名（接尾辞）",
        placeholder: "例: 山田進学",
        maxLength: 8,
        errorMessage: "塾名の接頭辞を入力してください。",
        options: SUFFIX_OPTIONS,
        inlineConfirm: true,
        inlineConfirmLabel: "この塾名で登録",
      },
      {
        id: "confirmSchool",
        type: "textTemplate",
        template: (state) => `そうでした！「${state.schoolPrefix}${state.schoolSuffix}」でしたね。大変失礼いたしました。`,
      },
      {
        id: "announceCampusSelection",
        type: "text",
        message: "それでは、最初に開校する校舎を決めましょう。立地によって初期費用や商圏内の生徒数に違いがあります。",
      },
      {
        id: "askInitialCampus",
        type: "campusSelect",
        field: "initialCampusId",
        label: "最初に開校する校舎を選んでください。",
        options: campusOptions,
        confirmLabel: "この校舎に決める",
      },
      {
        id: "announceStudents",
        type: "textTemplate",
        template: (state) => {
          const campusName = this.getCampusDisplayName(state.initialCampusId) || "こちらの校舎";
          const estimatedStudents = this.estimateInitialStudents(state.initialCampusId);
          const campusData = this.simulation.campusCatalog.find((c) => c.id === state.initialCampusId);
          const cappedEstimate = (() => {
            if (!estimatedStudents) {
              return null;
            }
            const capacity = campusData?.intakeCapacity;
            if (Number.isFinite(capacity)) {
              return Math.min(estimatedStudents, capacity);
            }
            return estimatedStudents;
          })();
          const studentLabel = cappedEstimate
            ? `${cappedEstimate.toLocaleString()}人`
            : "多くの生徒";
          return `${campusName}で開校準備を進めています。有名な塾の新規開校とあって、初月からおよそ${studentLabel}が集まりそうです。`;
        },
      },
      {
        id: "teacherPrompt",
        type: "text",
        message: "次は、1人目の先生を採用しましょう。先生の熟練度や専門分野によって、生徒の満足度や集客力が変わります。",
          confirmLabel: "この先生に決める",
      },
      {
        id: "selectTeacher",
        type: "teacherSelect",
        field: "initialTeacherId",
        label: "1人目の先生を選んでください。",
        options: teacherOptions,
      },
      {
        id: "final",
        type: "final",
        message: "準備は万端です。それでは、さっそく開業手続きを進めましょう！",
      },
    ];
  }

  updateHeader() {
    const player = this.simulation.player;
    if (!player) {
      this.refs.currentDate.textContent = this.formatDate(START_YEAR, START_MONTH);
      this.refs.currentFunds.textContent = `${this.formatMillionYen(DEFAULT_FUNDS)}万円`;
      if (this.refs.currentSchoolName) {
        this.refs.currentSchoolName.textContent = "未設定";
      }
      if (this.refs.elapsedMonths) {
        this.refs.elapsedMonths.textContent = "経過月数 0ヶ月";
      }
      return;
    }
    this.refs.currentDate.textContent = this.formatDate(player.year, player.month);
    this.refs.currentFunds.textContent = `${this.formatMillionYen(player.funds)}万円`;
    if (this.refs.currentSchoolName) {
      this.refs.currentSchoolName.textContent = player.schoolName || "未設定";
    }
    if (this.refs.elapsedMonths) {
      const months = this.calculateElapsedMonths(player.year, player.month);
      this.refs.elapsedMonths.textContent = `経過月数 ${months}ヶ月`;
    }
  }

  calculateElapsedMonths(year, month) {
    const startIndex = (START_YEAR - 1) * 12 + START_MONTH;
    const currentIndex = (year - 1) * 12 + month;
    return Math.max(0, currentIndex - startIndex);
  }

  updatePriorityMetrics() {
    const studentsValueEl = this.refs.metricTotalStudents;
    const studentsDeltaEl = this.refs.metricTotalStudentsDelta;
    const satisfactionValueEl = this.refs.metricAvgSatisfaction;
    const satisfactionDeltaEl = this.refs.metricAvgSatisfactionDelta;
    if (!studentsValueEl || !satisfactionValueEl) {
      return;
    }

    const snapshot = this.getAggregatedCampusSnapshot();
    studentsValueEl.textContent = `${snapshot.totalStudents.toLocaleString()}人`;
    satisfactionValueEl.textContent = snapshot.campusCount
      ? snapshot.avgSatisfaction.toFixed(1)
      : "0.0";

    const studentDelta = this.lastMonthlySummary?.studentDelta;
    const satisfactionDelta = this.lastMonthlySummary?.avgSatisfactionDelta;
    this.updateMetricDeltaText(studentsDeltaEl, studentDelta, "人");
    this.updateMetricDeltaText(satisfactionDeltaEl, satisfactionDelta, "pt", 1);
  }

  renderTabs() {
    const container = this.refs.campusTabs;
    container.innerHTML = "";
    if (!this.simulation.player) {
      return;
    }
    const activeId = this.getActiveCampus()?.id;
    this.simulation.player.campuses.forEach((campus) => {
      const button = document.createElement("button");
      button.textContent = campus.name;
      button.classList.toggle("active", campus.id === activeId);
      button.addEventListener("click", () => {
        this.activeCampusId = campus.id;
        this.renderTabs();
        this.renderCampusDetail();
      });
      container.appendChild(button);
    });
  }

  renderCampusDetail() {
    const container = this.refs.campusDetail;
    const campus = this.getActiveCampus();
    if (!campus) {
      container.textContent = "校舎情報がここに表示されます。";
      this.updateAdButtonLabel(null);
      return;
    }

    const displayClassCount = Math.max(
      1,
      Math.ceil((campus.studentCount || 0) / STUDENTS_PER_DISPLAY_CLASS)
    );
    const capacityLabel = this.formatIntakeCapacity(campus.intakeCapacity);
    const capacityUsage =
      Number.isFinite(campus.intakeCapacity) && campus.intakeCapacity > 0
        ? Math.min(100, Math.round((campus.studentCount / campus.intakeCapacity) * 100))
        : null;

    const stats = [
      { label: "生徒数", value: `${campus.studentCount.toLocaleString()}人` },
      { label: "満足度", value: `${campus.satisfaction.toFixed(1)}` },
      { label: "クラス数", value: `${displayClassCount}クラス` },
      {
        label: "受入上限",
        value: capacityUsage !== null ? `${capacityLabel}（${capacityUsage}%）` : capacityLabel,
      },
      { label: "授業料", value: `${campus.tuitionPerStudent.toLocaleString()}円` },
      { label: "広告", value: this.renderAdPlanStatus(campus) },
    ];

    const finance = campus.lastFinancialSnapshot;
    const teacherItems = (campus.teachers || [])
      .map((teacher) => {
        const portrait = this.getTeacherPortrait(teacher.templateId || teacher.id);
        const initials = teacher.name ? teacher.name.charAt(0) : "?";
        const avatar = portrait
          ? `<img src="${portrait}" alt="${teacher.name}の顔アイコン" class="teacher-avatar" width="48" height="48" loading="lazy" />`
          : `<div class="teacher-avatar placeholder" aria-hidden="true">${initials}</div>`;
        const personalityLine = teacher.personality
          ? `<span class="teacher-personality">性格: ${teacher.personality}</span>`
          : "";
        return `
                <li>
                  ${avatar}
                  <div class="teacher-info">
                    <div class="teacher-info-row">
                      <strong>${teacher.name}</strong>
                      <span class="teacher-rank-label">${this.renderRankLabel(teacher.rank)}</span>
                    </div>
                    <span class="teacher-meta-line">月給 ${teacher.baseSalary.toLocaleString()}円</span>
                    ${personalityLine}
                  </div>
                </li>`;
      })
      .join("");
    const teacherListMarkup = teacherItems
      ? teacherItems
      : '<li class="teacher-list-empty">先生が割り当てられていません。</li>';

    container.innerHTML = `
      <div class="campus-header">
        <div>
          <h3>${campus.name}</h3>
          <p class="muted">商圏内生徒数: ${campus.marketStudents.toLocaleString()}人 / 駅乗降客数: ${campus.stationTraffic}万人/日</p>
        </div>
      </div>
      <div class="stat-grid">
        ${stats
          .map(
            (item) => `
              <div>
                <p class="stat-label">${item.label}</p>
                <p class="stat-value">${item.value}</p>
              </div>`
          )
          .join("")}
      </div>
      ${
        finance
          ? `<div class="finance-box">
              <h4>最新月の収支</h4>
              <ul>
                <li>売上: ${finance.revenue.toLocaleString()}円</li>
                <li>家賃: ${finance.rentCost.toLocaleString()}円</li>
                <li>給与: ${finance.salaryCost.toLocaleString()}円</li>
                <li>広告: ${finance.adCost.toLocaleString()}円</li>
                <li>ロイヤリティ: ${finance.royaltyCost.toLocaleString()}円</li>
                <li>諸経費: ${this.formatYen(finance.miscCost ?? 0)}</li>
                <li>利益: ${finance.profit.toLocaleString()}円</li>
              </ul>
            </div>`
          : ""
      }
      <div class="teacher-list">
        <h4>先生一覧</h4>
        <ul>
          ${teacherListMarkup}
        </ul>
      </div>
    `;

    this.updateAdButtonLabel(campus);
  }

  getAggregatedCampusSnapshot() {
    const player = this.simulation.player;
    if (!player || !player.campuses?.length) {
      return { totalStudents: 0, avgSatisfaction: 0, campusCount: 0 };
    }
    let totalStudents = 0;
    let satisfactionSum = 0;
    player.campuses.forEach((campus) => {
      totalStudents += campus.studentCount || 0;
      satisfactionSum += typeof campus.satisfaction === "number" ? campus.satisfaction : 0;
    });
    const campusCount = player.campuses.length;
    const avgSatisfaction = campusCount ? satisfactionSum / campusCount : 0;
    return { totalStudents, avgSatisfaction, campusCount };
  }

  updateMetricDeltaText(element, value, unit, decimals = 0) {
    if (!element) {
      return;
    }
    element.classList.remove("positive", "negative", "neutral");
    if (typeof value !== "number") {
      element.textContent = "前月比 データなし";
      element.classList.add("neutral");
      return;
    }
    const threshold = decimals > 0 ? 0.05 : 0;
    const isPositive = value > threshold;
    const isNegative = value < -threshold;
    const prefix = isPositive ? "+" : isNegative ? "-" : "±";
    const absolute = decimals > 0
      ? Math.abs(value).toFixed(decimals)
      : Math.abs(Math.round(value)).toLocaleString();
    element.textContent = `前月比 ${prefix}${absolute}${unit}`;
    element.classList.add(isPositive ? "positive" : isNegative ? "negative" : "neutral");
  }

  renderRankLabel(rank) {
    switch (rank) {
      case "senior":
        return "ベテラン";
      case "mid":
        return "中堅";
      case "junior":
        return "新米";
      default:
        return rank;
    }
  }

  renderAdPlanStatus(campus) {
    if (!campus) {
      return "広告なし";
    }
    const activeLabel = campus.adPlan?.label ?? "広告なし";
    if (campus.nextAdPlan && campus.adPlan?.id !== campus.nextAdPlan.id) {
      return `${activeLabel}（来月: ${campus.nextAdPlan.label}）`;
    }
    return activeLabel;
  }

  formatYen(value) {
    if (typeof value !== "number") {
      return "-";
    }
    return `${value.toLocaleString()}円`;
  }

  formatMillionYen(value) {
    if (typeof value !== "number") {
      return "-";
    }
    const units = Math.round(value / 10_000);
    return units.toLocaleString();
  }

  formatSaveTimestamp(value) {
    if (!value) {
      return "日時不明";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "日時不明";
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${d} ${hh}:${mm}`;
  }

  formatSignedYen(value) {
    if (typeof value !== "number") {
      return "-";
    }
    const absolute = Math.abs(value).toLocaleString();
    if (value > 0) {
      return `+${absolute}円`;
    }
    if (value < 0) {
      return `-${absolute}円`;
    }
    return `${absolute}円`;
  }

  formatNumber(value) {
    if (typeof value !== "number") {
      return "-";
    }
    return value.toLocaleString();
  }

  formatIntakeCapacity(value) {
    if (!Number.isFinite(value)) {
      return "制限なし";
    }
    return `${value.toLocaleString()}人`;
  }

  formatMonthlyRent(value) {
    if (!Number.isFinite(value)) {
      return "不明";
    }
    const hasDecimal = Math.abs(value - Math.round(value)) > 0.001;
    const localeOptions = hasDecimal
      ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
      : undefined;
    const formatted = localeOptions ? value.toLocaleString(undefined, localeOptions) : value.toLocaleString();
    return `${formatted}万円/月`;
  }

  getCampusThumbnail(campusId) {
    return `./assets/img/school/${campusId}.png`;
  }

  getTeacherPortrait(templateId) {
    if (!templateId) {
      return "";
    }
    return `./assets/img/people/teacher/${templateId}.png`;
  }

  getPagination(stepId) {
    if (!stepId) {
      return 0;
    }
    return this.paginationState?.[stepId] ?? 0;
  }

  setPagination(stepId, page) {
    if (!stepId) {
      return;
    }
    if (!this.paginationState) {
      this.paginationState = {};
    }
    this.paginationState[stepId] = page;
  }

  renderGraph() {
    if (!this.financeGraph) {
      return;
    }
    const history = this.simulation.player?.revenueHistory ?? [];
    this.financeGraph.render(history);
  }

  consumeMonthlySummary(summary) {
    if (summary) {
      this.lastMonthlySummary = summary;
    }
    this.refreshUI();
    if (!summary) {
      return;
    }
    const reachedEnd = this.simulation.didReachCampaignEnd(summary);
    let managementLine = this.composeManagementMessage(summary);
    if (reachedEnd) {
      const totalStudentsLabel = this.formatNumber(summary.studentsAfter ?? 0);
      managementLine = `全60ヶ月の経営が終了しました。最終的な総生徒数は${totalStudentsLabel}人です。`;
    }
    this.setConversationLine(managementLine);
    this.showMonthlyResultModal(summary);
    if (reachedEnd) {
      this.pendingCampaignResult = true;
      this.pendingCampaignSummary = summary;
      this.updateControlStates();
    }
  }

  promptTeacherHiring(shortages) {
    this.pendingTeacherShortages = shortages.map((item) => ({ ...item }));
    this.showTeacherShortageModal();
  }

  showTeacherShortageModal() {
    if (!this.pendingTeacherShortages.length) {
      this.hideModal(true);
      const summary = this.pendingMonthlySummary;
      this.pendingMonthlySummary = null;
      this.consumeMonthlySummary(summary);
      return;
    }

    const shortage = this.pendingTeacherShortages[0];
    let campus = null;
    try {
      campus = this.simulation.getCampus(shortage.campusId);
    } catch (error) {
      console.error(error);
      this.pendingTeacherShortages.shift();
      this.showTeacherShortageModal();
      return;
    }

    const remainingDeficit = this.simulation.getTeacherDeficit(campus);
    if (remainingDeficit <= 0) {
      this.pendingTeacherShortages.shift();
      this.showTeacherShortageModal();
      return;
    }

    shortage.deficit = remainingDeficit;

    const assignedTemplateIds = new Set(
      (campus.teachers || []).map((teacher) => teacher.templateId || teacher.id)
    );

    const modal = document.createElement("div");
    modal.className = "modal teacher-shortage-modal";
    modal.innerHTML = `
      <div class="modal-head">
        <h3>先生不足: ${campus.name}</h3>
        <p class="muted">生徒${campus.studentCount.toLocaleString()}人に対し、先生${campus.teachers.length}人です。あと${remainingDeficit}人の先生が必要です。</p>
      </div>
      <div class="campus-card-grid-wrapper">
        <div class="teacher-hire-grid campus-card-grid teacher-card-grid"></div>
      </div>
      <div class="modal-actions">
        <button class="primary" data-action="hire" disabled>この先生を採用する</button>
      </div>
    `;

    const grid = modal.querySelector(".teacher-hire-grid");
    const confirmBtn = modal.querySelector("[data-action='hire']");
    const teacherOptions = this.simulation.teacherTemplates.map((teacher) => ({
      value: teacher.id,
      label: teacher.name,
      rank: teacher.rank,
      baseSalary: teacher.baseSalary,
      satisfactionImpact: teacher.satisfactionImpact,
      gender: teacher.gender,
      specialty: teacher.specialty,
      personality: teacher.personality,
      portrait: this.getTeacherPortrait(teacher.templateId || teacher.id),
    }));

    let selectedId = "";
    const cards = [];

    teacherOptions.forEach((option) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "campus-card teacher-card";
      card.dataset.teacherId = option.value;
      const isAssigned = assignedTemplateIds.has(option.value);
      if (isAssigned) {
        card.classList.add("disabled");
        card.disabled = true;
      }

      if (option.portrait) {
        const portraitWrapper = document.createElement("div");
        portraitWrapper.className = "teacher-portrait";
        const portrait = document.createElement("img");
        portrait.src = option.portrait;
        portrait.alt = `${option.label}のアイコン`;
        portrait.width = 400;
        portrait.height = 400;
        portraitWrapper.appendChild(portrait);
        card.appendChild(portraitWrapper);
      }

      const content = document.createElement("div");
      content.className = "teacher-card-content";
      const name = document.createElement("p");
      name.className = "teacher-name";
      name.textContent = option.label;

      const subtitle = document.createElement("p");
      subtitle.className = "teacher-meta";
      const genderLabel = option.gender === "female" ? "女性" : option.gender === "male" ? "男性" : "-";
      subtitle.textContent = `${this.renderRankLabel(option.rank)} / ${genderLabel}`;

      const specialty = document.createElement("p");
      specialty.className = "teacher-specialty";
      specialty.textContent = option.specialty ? `専門: ${option.specialty}` : "";

      const salary = document.createElement("p");
      salary.className = "teacher-meta";
      salary.textContent = `月給: ${option.baseSalary.toLocaleString()}円`;

      const personality = document.createElement("p");
      personality.className = "teacher-meta teacher-personality";
      personality.textContent = option.personality ? `性格: ${option.personality}` : "性格: 不明";

      content.append(name, subtitle);
      if (option.specialty) {
        content.appendChild(specialty);
      }
      content.append(salary, personality);

      if (isAssigned) {
        const badge = document.createElement("span");
        badge.className = "teacher-card-badge";
        badge.textContent = "採用済み";
        content.appendChild(badge);
      }

      card.appendChild(content);

      card.addEventListener("click", () => {
        if (isAssigned) {
          return;
        }
        selectedId = option.value;
        cards.forEach((node) => node.classList.toggle("selected", node.dataset.teacherId === selectedId));
        confirmBtn.disabled = !selectedId;
      });

      cards.push(card);
      grid.appendChild(card);
    });

    confirmBtn.addEventListener("click", () => {
      if (!selectedId) {
        return;
      }
      try {
        this.simulation.hireTeacherForCampus(campus.id, selectedId);
        this.refreshUI();
      } catch (error) {
        this.showModalError(modal, error.message);
        return;
      }
      selectedId = "";
      confirmBtn.disabled = true;
      const updated = this.simulation.getTeacherDeficit(campus);
      if (updated <= 0) {
        this.pendingTeacherShortages.shift();
      } else {
        this.pendingTeacherShortages[0].deficit = updated;
      }
      this.showTeacherShortageModal();
    });

    this.showModal(modal, { lock: true });
  }

  updateControlStates() {
    const hasGame = this.simulation.hasActiveGame();
    const actionableButtons = [this.refs.openCampusBtn, this.refs.nextMonthBtn, this.refs.saveBtn];
    actionableButtons.forEach((btn) => {
      if (btn) {
        btn.disabled = !hasGame;
      }
    });

    if (this.refs.toggleAdBtn) {
      this.refs.toggleAdBtn.disabled = !hasGame || !this.getActiveCampus();
    }
  }

  updateAdButtonLabel(campus) {
    if (!this.refs.toggleAdBtn) {
      return;
    }
    if (!campus) {
      this.refs.toggleAdBtn.textContent = "広告プラン設定";
      return;
    }
    const currentLabel = campus.adPlan?.label ?? "広告なし";
    this.refs.toggleAdBtn.textContent = `広告プラン: ${currentLabel}`;
  }

  renderCanvasPlaceholder() {
    if (!this.financeGraph) {
      return;
    }
    this.financeGraph.render([]);
  }

  showMonthlyResultModal(summary) {
    if (!summary) {
      return;
    }

    this.restoreConversationWindow();

    const breakdown = summary.breakdown || {};
    const fundsBefore =
      typeof summary.fundsBefore === "number"
        ? summary.fundsBefore
        : summary.fundsAfter - (summary.totalProfit ?? 0);
    const studentsBefore = summary.studentsBefore ?? 0;
    const studentsAfter =
      summary.studentsAfter ?? studentsBefore + (summary.studentDelta ?? 0);
    const totalStudentDelta = studentsAfter - studentsBefore;
    const avgSatisfactionBefore =
      typeof summary.avgSatisfactionBefore === "number"
        ? summary.avgSatisfactionBefore
        : 0;
    const avgSatisfactionAfter =
      typeof summary.avgSatisfactionAfter === "number"
        ? summary.avgSatisfactionAfter
        : avgSatisfactionBefore;
    const avgSatisfactionDelta =
      typeof summary.avgSatisfactionDelta === "number"
        ? summary.avgSatisfactionDelta
        : avgSatisfactionAfter - avgSatisfactionBefore;
    const formatDelta = (value, unit, decimals = 0) => {
      if (typeof value !== "number" || Number.isNaN(value)) {
        return `±0${unit}`;
      }
      const threshold = decimals > 0 ? 0.05 : 0;
      const isPositive = value > threshold;
      const isNegative = value < -threshold;
      const prefix = isPositive ? "+" : isNegative ? "-" : "±";
      const absolute = decimals > 0
        ? Math.abs(value).toFixed(decimals)
        : Math.abs(Math.round(value)).toLocaleString();
      return `${prefix}${absolute}${unit}`;
    };
    const deltaClass = (value) => (value > 0 ? "value-positive" : value < 0 ? "value-negative" : "");

    const campusList = (summary.campuses || [])
      .map((campus) => {
        const profitClass = (campus.profit ?? 0) >= 0 ? "value-positive" : "value-negative";
        const satisfactionLabel =
          typeof campus.satisfaction === "number" ? campus.satisfaction.toFixed(1) : "-";
        const campusSatisfactionDelta =
          typeof campus.satisfactionDelta === "number" ? campus.satisfactionDelta : 0;
        const satisfactionDeltaLabel =
          Math.abs(campusSatisfactionDelta) >= 0.05
            ? ` (${campusSatisfactionDelta > 0 ? "+" : ""}${campusSatisfactionDelta.toFixed(1)}pt)`
            : "";
        const studentLabel =
          typeof campus.studentCount === "number"
            ? campus.studentCount.toLocaleString()
            : "-";
        const studentDeltaLabel =
          typeof campus.studentDelta === "number" && campus.studentDelta !== 0
            ? ` (${campus.studentDelta > 0 ? "+" : ""}${campus.studentDelta.toLocaleString()}人)`
            : "";
        const intakeLabel = this.formatIntakeCapacity(campus.intakeCapacity);
        const intakeStatus =
          Number.isFinite(campus.intakeCapacity) && campus.studentCount >= campus.intakeCapacity
            ? "（上限到達）"
            : "";
        return `
          <li class="campus-result-card">
            <div class="campus-result-head">
              <strong>${campus.name}</strong>
              <span>${studentLabel}人${studentDeltaLabel} / 満足度 ${satisfactionLabel}${satisfactionDeltaLabel}</span>
            </div>
            <div class="campus-result-body">
              <ul class="breakdown-list">
                <li><span>売上</span><strong>${this.formatYen(campus.revenue)}</strong></li>
                <li><span>家賃</span><strong>${this.formatYen(campus.rentCost)}</strong></li>
                <li><span>給与</span><strong>${this.formatYen(campus.salaryCost)}</strong></li>
                <li><span>広告</span><strong>${this.formatYen(campus.adCost)}</strong></li>
                <li><span>ロイヤリティ</span><strong>${this.formatYen(campus.royaltyCost)}</strong></li>
                <li><span>諸経費</span><strong>${this.formatYen(campus.miscCost ?? 0)}</strong></li>
                <li><span>利益</span><strong class="${profitClass}">${this.formatSignedYen(campus.profit)}</strong></li>
              </ul>
            </div>
            <div class="campus-result-meta">
              <span>広告: ${campus.adPlanLabel}</span>
              <span>受入上限: ${intakeLabel}${intakeStatus}</span>
            </div>
          </li>
        `;
      })
      .join("");

    const modal = document.createElement("div");
    modal.className = "modal monthly-result-modal";
    modal.innerHTML = `
      <h3>その月の結果 <span>${this.formatDate(summary.year, summary.month)}</span></h3>
      <div class="monthly-result-scroll">
        <div class="monthly-result-focus">
          <div class="focus-card">
            <p class="label">総生徒数</p>
            <p class="value">${this.formatNumber(studentsAfter)}人</p>
            <p class="delta ${deltaClass(totalStudentDelta)}">${formatDelta(totalStudentDelta, "人")}</p>
          </div>
          <div class="focus-card">
            <p class="label">平均満足度</p>
            <p class="value">${avgSatisfactionAfter.toFixed(1)}</p>
            <p class="delta ${deltaClass(avgSatisfactionDelta)}">${formatDelta(avgSatisfactionDelta, "pt", 1)}</p>
          </div>
        </div>
        <div class="monthly-result-overview">
          <div>
            <p class="label">売上</p>
            <p class="value">${this.formatYen(summary.totalRevenue)}</p>
          </div>
          <div>
            <p class="label">費用</p>
            <p class="value">${this.formatYen(summary.totalCost)}</p>
          </div>
          <div>
            <p class="label">利益</p>
            <p class="value ${summary.totalProfit >= 0 ? "value-positive" : "value-negative"}">${this.formatSignedYen(summary.totalProfit)}</p>
          </div>
        </div>
        <div class="monthly-result-growth">
          <div class="growth-card">
            <p class="label">資金残高</p>
            <p class="value-arrow">${this.formatMillionYen(fundsBefore)}万円 <span class="arrow">→</span> ${this.formatMillionYen(summary.fundsAfter)}万円</p>
            <p class="delta ${summary.totalProfit >= 0 ? "value-positive" : "value-negative"}">
              （${this.formatSignedYen(summary.totalProfit)}）
            </p>
          </div>
          <div class="growth-card">
            <p class="label">平均満足度</p>
            <p class="value-arrow">${avgSatisfactionBefore.toFixed(1)}pt <span class="arrow">→</span> ${avgSatisfactionAfter.toFixed(1)}pt</p>
            <p class="delta ${avgSatisfactionDelta >= 0 ? "value-positive" : "value-negative"}">
              （${formatDelta(avgSatisfactionDelta, "pt", 1)}）
            </p>
          </div>
        </div>
        <div class="monthly-result-breakdown">
          <div class="breakdown-card">
            <h4>売上</h4>
            <ul class="breakdown-list">
              <li><span>授業料</span><strong>${this.formatYen(summary.totalRevenue)}</strong></li>
            </ul>
          </div>
          <div class="breakdown-card">
            <h4>費用</h4>
            <ul class="breakdown-list">
              <li><span>家賃</span><strong>${this.formatYen(breakdown.rentCost)}</strong></li>
              <li><span>給与</span><strong>${this.formatYen(breakdown.salaryCost)}</strong></li>
              <li><span>広告</span><strong>${this.formatYen(breakdown.adCost)}</strong></li>
              <li><span>ロイヤリティ</span><strong>${this.formatYen(breakdown.royaltyCost)}</strong></li>
              <li><span>諸経費</span><strong>${this.formatYen(breakdown.miscCost ?? 0)}</strong></li>
            </ul>
          </div>
        </div>
        <div class="monthly-result-campus">
          <h4>校舎別サマリー</h4>
          <ul>
            ${campusList || "<li class=\"muted\">校舎データがありません。</li>"}
          </ul>
        </div>
      </div>
      <div class="monthly-result-footer">
        <p>資金残高: <strong>${this.formatMillionYen(summary.fundsAfter)}万円</strong></p>
      </div>
      <div class="modal-actions">
        <button class="primary" data-dismiss="true">閉じる</button>
      </div>
    `;

    modal.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-dismiss]");
      if (target) {
        this.hideModal();
      }
    });

    this.showModal(modal);
  }

  showCampaignCompleteModal(summary = null) {
    const player = this.simulation.player;
    if (!player) {
      return;
    }
    const campuses = Array.isArray(player.campuses) ? player.campuses : [];
    const snapshot = this.getAggregatedCampusSnapshot();
    const totalStudentsLabel = `${this.formatNumber(snapshot.totalStudents)}人`;
    const avgSatisfactionLabel = snapshot.campusCount
      ? `${snapshot.avgSatisfaction.toFixed(1)}pt`
      : "0.0pt";
    const completionLine = summary?.isCampaignEnd
      ? "全60ヶ月の経営が終了しました。"
      : "このデータはすでに全60ヶ月の経営を完了しています。";
    const monthsPlayed = player.elapsedMonths ?? 0;
    const fundsLabel = `${this.formatMillionYen(player.funds)}万円`;
    const shareIntentUrl = this.buildCampaignShareUrl(player, snapshot);
    const bestCampus = this.getTopCampusByStudents(campuses);
    const campusRanking = campuses
      .slice()
      .sort((a, b) => (b.studentCount ?? 0) - (a.studentCount ?? 0))
      .map((campus) => {
        const studentCount =
          typeof campus.studentCount === "number" ? campus.studentCount : 0;
        const satisfaction =
          typeof campus.satisfaction === "number" ? campus.satisfaction.toFixed(1) : "-";
        return `
          <li>
            <div>
              <strong>${campus.name}</strong>
              <span class="muted">${
                typeof campus.stationTraffic === "number"
                  ? `${campus.stationTraffic}万人/日`
                  : "駅データ不明"
              }</span>
            </div>
            <div class="final-campus-metrics">
              <span>${studentCount.toLocaleString()}人</span>
              <span>満足度 ${satisfaction}</span>
            </div>
          </li>
        `;
      })
      .join("");

    const modal = document.createElement("div");
    modal.className = "modal campaign-complete-modal";
    modal.innerHTML = `
      <h3>最終結果</h3>
      <div class="campaign-complete-scroll">
        <p class="muted">${completionLine} 目標だった「総生徒数の最大化」に向けた最終スコアを確認しましょう。</p>
        <div class="final-highlight">
          <div class="final-card">
            <p class="label">総獲得生徒数</p>
            <p class="value">${totalStudentsLabel}</p>
            <p class="sub">${monthsPlayed}ヶ月間の累計</p>
          </div>
          <div class="final-card">
            <p class="label">平均満足度</p>
            <p class="value">${avgSatisfactionLabel}</p>
            <p class="sub">全校舎平均</p>
          </div>
          <div class="final-card">
            <p class="label">最終資金</p>
            <p class="value">${fundsLabel}</p>
            <p class="sub">運転資金残高</p>
          </div>
        </div>
        ${(() => {
          if (!bestCampus) {
            return "";
          }
          const bestCount =
            typeof bestCampus.studentCount === "number"
              ? bestCampus.studentCount.toLocaleString()
              : "0";
          const satisfactionLabel =
            typeof bestCampus.satisfaction === "number"
              ? `${bestCampus.satisfaction.toFixed(1)}pt`
              : "データ不明";
          return `<p class="best-campus">最多生徒は<strong>${bestCampus.name}</strong>で${bestCount}人（満足度 ${satisfactionLabel}）。ブランド牽引役となりました。</p>`;
        })()}
        <div class="monthly-result-campus final">
          <h4>校舎別の最終状況</h4>
          <ul class="final-campus-list">
            ${campusRanking || '<li class="muted">校舎データがありません。</li>'}
          </ul>
        </div>
      </div>
      <div class="modal-actions">
        <button class="button-share" data-action="share-result">Xでシェア</button>
        <button class="secondary" data-action="return-title">タイトルに戻る</button>
        <button class="primary" data-dismiss="true">閉じる</button>
      </div>
    `;

    modal.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }
      if (button.dataset.action === "share-result") {
        this.openShareIntent(shareIntentUrl);
        return;
      }
      if (button.dataset.action === "return-title") {
        this.returnToTitleScreen();
        return;
      }
      if (button.dataset.dismiss) {
        this.hideModal();
      }
    });

    this.showModal(modal);
  }

  showModal(contentNode, options = {}) {
    this.refs.modalLayer.innerHTML = "";
    this.refs.modalLayer.appendChild(contentNode);
    this.refs.modalLayer.classList.remove("hidden");
    this.modalLocked = Boolean(options.lock);
  }

  hideModal(force = false) {
    if (this.modalLocked && !force) {
      return;
    }
    this.modalLocked = false;
    this.refs.modalLayer.classList.add("hidden");
    this.refs.modalLayer.innerHTML = "";
    if (this.pendingCampaignResult) {
      const summary = this.pendingCampaignSummary;
      this.pendingCampaignResult = false;
      this.pendingCampaignSummary = null;
      setTimeout(() => this.showCampaignCompleteModal(summary), 0);
    }
  }

  formatDate(year, month) {
    return `X${year}年${month}月`;
  }

  composeManagementMessage(summary) {
    if (!summary) {
      return "経営フェーズを開始しました。初月の動きを見守りましょう。";
    }
    return (
      this.trySeasonalEventMessage(summary) ||
      this.tryGrowthMessage(summary) ||
      this.buildSmallTalkMessage(summary)
    );
  }

  trySeasonalEventMessage(summary) {
    const monthEvents = {
      1: (campus) => `新年の抱負を語る保護者が多いですね。${campus?.name ?? "各校舎"}も体験申し込みが増えています。`,
      3: (campus) => `受験シーズンも大詰めです。${campus?.name ?? "各校舎"}の指導が評価されています。`,
      4: (campus) => `新年度が始まり、${campus?.name ?? "各校舎"}には問い合わせが続々です。`,
      7: (campus) => `夏期講習の準備で${campus?.name ?? "各校舎"}が慌ただしくなっています。`,
      8: (campus, data) => `夏期講習の成果が出ました。今月の売上は${this.formatYen(data.totalRevenue)}です。`,
      12: (campus) => `冬期講習と受験対策で${campus?.name ?? "各校舎"}の教室が熱気に包まれています。`,
    };
    const handler = monthEvents[summary.month];
    if (!handler) {
      return null;
    }
    const campus = this.getTopCampusByProfit(summary.campuses);
    return handler(campus, summary);
  }

  tryGrowthMessage(summary) {
    if (!summary?.campuses?.length) {
      return null;
    }
    const sorted = [...summary.campuses].sort(
      (a, b) => (b.studentDelta ?? 0) - (a.studentDelta ?? 0)
    );
    const best = sorted[0];
    const delta = best?.studentDelta ?? 0;
    if (delta < 20) {
      return null;
    }
    const adText =
      best.adPlanLabel && best.adPlanLabel !== "広告なし"
        ? `${best.adPlanLabel}の手応えがあり`
        : "口コミが広がり";
    const satisfactionText =
      typeof best.satisfaction === "number"
        ? `満足度も${best.satisfaction.toFixed(1)}点で推移しています。`
        : "評価も上向きです。";
    return `${best.name}で生徒が${delta}人増えました。${adText}${satisfactionText}`;
  }

  buildSmallTalkMessage(summary) {
    const campus = this.getTopCampusByProfit(summary.campuses);
    const campusName = campus?.name ?? "各校舎";
    const satisfactionLabel =
      typeof campus?.satisfaction === "number" ? campus.satisfaction.toFixed(1) : "50";
    const adLabel = campus?.adPlanLabel ?? "広告なし";
    const templates = [
      () => `${campusName}は今月 ${this.formatSignedYen(campus?.profit ?? 0)} で着地しました。資金残高は${this.formatYen(summary.fundsAfter)}です。`,
      () => `${campusName}の満足度は${satisfactionLabel}点。地道な改善が成果につながっています。`,
      () => `${adLabel}を継続しながら、次の仕掛けを考えておきましょう。`,
      () => `今月は特段の事件もなく穏やかでした。じっくりと次の施策を練りましょう。`,
    ];
    const index = (summary.year * 12 + summary.month) % templates.length;
    return templates[index]();
  }

  getTopCampusByProfit(campuses = []) {
    if (!campuses?.length) {
      return null;
    }
    return campuses.reduce((best, campus) => {
      if (!best) {
        return campus;
      }
      const currentProfit =
        typeof campus.profit === "number" ? campus.profit : Number.NEGATIVE_INFINITY;
      const bestProfit =
        typeof best.profit === "number" ? best.profit : Number.NEGATIVE_INFINITY;
      return currentProfit > bestProfit ? campus : best;
    }, null);
  }

  getTopCampusByStudents(campuses = []) {
    if (!campuses?.length) {
      return null;
    }
    return campuses.reduce((best, campus) => {
      if (!best) {
        return campus;
      }
      const currentStudents =
        typeof campus.studentCount === "number" ? campus.studentCount : Number.NEGATIVE_INFINITY;
      const bestStudents =
        typeof best.studentCount === "number" ? best.studentCount : Number.NEGATIVE_INFINITY;
      return currentStudents > bestStudents ? campus : best;
    }, null);
  }

  buildCampaignShareUrl(player, snapshot) {
    if (!player) {
      return "";
    }
    const schoolName = player.schoolName || "名称未設定の塾";
    const totalStudents = this.formatNumber(snapshot?.totalStudents ?? 0);
    const funds = this.formatMillionYen(player.funds ?? 0);
    const avg = snapshot?.campusCount ? snapshot.avgSatisfaction.toFixed(1) : "0.0";
    const shareUrl =
      typeof window !== "undefined" && window.location
        ? window.location.origin || window.location.href
        : "";
    const text = [
      "経営シミュレーションゲーム「塾のフランチャイズオーナーになろう！」",
      shareUrl || "http://127.0.0.1:5500",
      "",
      `『${schoolName}』で全60ヶ月の運営完了！`,
      `最終資金${funds}万円 / 総生徒${totalStudents}人 / 平均満足度${avg}pt`,
      "",
      "#塾フランチャイズオーナーになろう！",
    ].join("\n");
    const params = new URLSearchParams();
    params.set("text", text);
    return `https://x.com/intent/post?${params.toString()}`;
  }

  openShareIntent(url) {
    if (!url) {
      this.showSystemMessage("共有リンクの生成に失敗しました。");
      return;
    }
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      this.showSystemMessage("ブラウザの設定によりポップアップがブロックされました。", "info");
    }
  }
}
