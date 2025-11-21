import { Player } from "./player.js";
import { Campus, CLASS_CAPACITY } from "./campus.js";
import { Classroom } from "./classroom.js";
import { Teacher } from "./teacher.js";

const MONTHLY_INFLOW_COEFF = 0.002;
const MONTHLY_ATTRITION_RATIO = 0.035;
const MONTHLY_RANDOM_SHAKE = 4;
const STATION_TRAFFIC_AD_COEFF = 0.005;
const RANDOM_SHAKE_RANGE = 2;
const SAVE_SLOT_PREFIX = "cram_school_save_slot_";
const SAVE_SLOT_IDS = ["A", "B", "C"];
const SAVE_VERSION = 2;
const CAMPAIGN_END_YEAR = 6;
const CAMPAIGN_END_MONTH = 3;
const INITIAL_STUDENT_DIVISOR = 200;
const NEUTRAL_SATISFACTION = 0;
const SATISFACTION_MIN = -100;
const SATISFACTION_MAX = 100;
const MIN_SATISFACTION_FLOW_FACTOR = 0.3;
const MAX_SATISFACTION_FLOW_FACTOR = 1.7;
const STUDENT_GROWTH_SATISFACTION_FACTOR = 0.1;
const STUDENT_GROWTH_SATISFACTION_MAX = 4;
const SATISFACTION_DAMP_THRESHOLD = 20;
const SATISFACTION_DAMP_DECAY = 18;
const MISC_EXPENSE_RATE = 0.03;
const AD_PLANS = [
  { id: "none", label: "広告なし", cost: 0, effect: 0, description: "広告費は発生しません。" },
  { id: "flyer", label: "ポスティング", cost: 50_000, effect: 0.05, description: "地域密着型のチラシ配布。" },
  { id: "listing", label: "リスティング広告", cost: 200_000, effect: 0.12, description: "検索連動型広告で効率的に集客。" },
  { id: "poster", label: "中吊り広告", cost: 500_000, effect: 0.25, description: "鉄道中吊りで広域訴求。" },
];
const AD_PLAN_MAP = AD_PLANS.reduce((map, plan) => {
  map[plan.id] = plan;
  return map;
}, {});

function normalizeSlotId(slotId) {
  if (!slotId) {
    return SAVE_SLOT_IDS[0];
  }
  const normalized = String(slotId).trim().toUpperCase();
  return SAVE_SLOT_IDS.includes(normalized) ? normalized : SAVE_SLOT_IDS[0];
}

function getSlotStorageKey(slotId) {
  const normalized = normalizeSlotId(slotId);
  return `${SAVE_SLOT_PREFIX}${normalized}`;
}

export class Simulation {
  constructor() {
    this.player = null;
    this.campusCatalog = [];
    this.teacherTemplates = [];
    this.teacherCursor = 0;
  }

  async loadStaticData() {
    const [campusRes, teacherRes] = await Promise.all([
      fetch("./data/campuses.json"),
      fetch("./data/initialTeachers.json"),
    ]);

    if (!campusRes.ok || !teacherRes.ok) {
      throw new Error("静的データの読込に失敗しました。");
    }

    this.campusCatalog = await campusRes.json();
    this.teacherTemplates = await teacherRes.json();
  }

  startNewGame(playerName, schoolName, initialCampusId, options = {}) {
    this.player = new Player({ name: playerName, schoolName });
    this.teacherCursor = 0;
    this.player.revenueHistory = [];

    if (options.initialTeacherTemplateId) {
      const idx = this.teacherTemplates.findIndex((t) => t.id === options.initialTeacherTemplateId);
      if (idx >= 0) {
        this.teacherCursor = idx + 1;
      }
    }

    if (initialCampusId) {
      const initialCampus = this.createCampusInstance(initialCampusId);
      if (this.player.funds < initialCampus.openingCost) {
        throw new Error("開校資金が不足しています。");
      }
      this.player.funds -= initialCampus.openingCost;
      this.seedCampus(initialCampus, {
        initialTeacherTemplateId: options.initialTeacherTemplateId,
      });
      this.player.campuses.push(initialCampus);
      return initialCampus;
    }

    return null;
  }

  resetGameState() {
    this.player = null;
    this.teacherCursor = 0;
  }

  hasActiveGame() {
    return Boolean(this.player);
  }

  createCampusInstance(campusId) {
    const base = this.campusCatalog.find((c) => c.id === campusId);
    if (!base) {
      throw new Error(`未知の校舎IDです: ${campusId}`);
    }
    return new Campus(base);
  }

  seedCampus(campus, options = {}) {
    const fallbackStudents = Math.max(1, Math.round(campus.marketStudents / INITIAL_STUDENT_DIVISOR));
    const seededStudents =
      typeof options.studentCount === "number" ? options.studentCount : fallbackStudents;
    campus.studentCount = this.clampToIntakeCapacity(campus, seededStudents);
    campus.satisfaction = NEUTRAL_SATISFACTION;
    campus.adPlan = AD_PLAN_MAP.none;
    campus.nextAdPlan = null;

    if (options.initialTeacherTemplateId) {
      const teacher = this.hireTeacherFromTemplate(options.initialTeacherTemplateId);
      campus.teachers.push(teacher);
      campus.classrooms.push(
        new Classroom({
          id: `${campus.id}-cls-${campus.classrooms.length + 1}`,
          campusId: campus.id,
          teacherId: teacher.id,
          capacity: CLASS_CAPACITY,
        })
      );
    }

    this.ensureCapacity(campus);
  }

  ensureCapacity(campus, { allowHire = true } = {}) {
    if (!campus) {
      return;
    }
    const required = Math.max(1, campus.requiredClassroomCount);
    if (allowHire) {
      while (campus.classrooms.length < required) {
        const teacher = this.hireNextTeacher();
        this.addTeacherToCampus(campus, teacher);
      }
    } else if (campus.classrooms.length === 0 && campus.teachers.length === 0) {
      const teacher = this.hireNextTeacher();
      this.addTeacherToCampus(campus, teacher);
    }

    this.reassignStudentsToClassrooms(campus);
  }

  reassignStudentsToClassrooms(campus) {
    if (!campus || !campus.classrooms?.length) {
      return;
    }
    let remaining = campus.studentCount;
    campus.classrooms.forEach((cls) => {
      const assigned = Math.min(CLASS_CAPACITY, remaining);
      cls.studentCount = assigned;
      remaining -= assigned;
    });
  }

  addTeacherToCampus(campus, teacher) {
    if (!campus || !teacher) {
      return;
    }
    campus.teachers.push(teacher);
    campus.classrooms.push(
      new Classroom({
        id: `${campus.id}-cls-${campus.classrooms.length + 1}`,
        campusId: campus.id,
        teacherId: teacher.id,
        capacity: CLASS_CAPACITY,
      })
    );
  }

  hireNextTeacher() {
    if (!this.teacherTemplates.length) {
      throw new Error("先生データが読み込まれていません。");
    }
    const template = this.teacherTemplates[this.teacherCursor % this.teacherTemplates.length];
    this.teacherCursor += 1;
    return this.instantiateTeacher(template);
  }

  hireTeacherFromTemplate(templateId) {
    const template = this.teacherTemplates.find((t) => t.id === templateId);
    if (!template) {
      throw new Error("指定された先生データが見つかりません。");
    }
    return this.instantiateTeacher(template);
  }

  hireTeacherForCampus(campusId, templateId) {
    const campus = this.getCampus(campusId);
    const teacher = templateId
      ? this.hireTeacherFromTemplate(templateId)
      : this.hireNextTeacher();
    this.addTeacherToCampus(campus, teacher);
    this.reassignStudentsToClassrooms(campus);
    return teacher;
  }

  getTeacherDeficit(campus) {
    if (!campus) {
      return 0;
    }
    const requiredTeachers = Math.max(1, Math.ceil(campus.studentCount / CLASS_CAPACITY));
    return Math.max(0, requiredTeachers - campus.teachers.length);
  }

  getTeacherDeficitByCampus(campusId) {
    const campus = this.player?.campuses?.find((c) => c.id === campusId);
    return this.getTeacherDeficit(campus);
  }

  getTeacherShortages() {
    if (!this.player) {
      return [];
    }
    return this.player.campuses
      .map((campus) => {
        const deficit = this.getTeacherDeficit(campus);
        if (deficit <= 0) {
          return null;
        }
        return { campusId: campus.id, campusName: campus.name, deficit };
      })
      .filter(Boolean);
  }

  instantiateTeacher(template) {
    const templateId = template.templateId || template.id;
    return new Teacher({
      ...template,
      templateId,
      id: `${templateId}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
    });
  }

  advanceMonth() {
    if (!this.player || this.player.isCampaignComplete) {
      return null;
    }

    const currentYear = this.player.year;
    const currentMonth = this.player.month;
    const fundsBefore = this.player.funds;
    let aggregatedRevenue = 0;
    let aggregatedCost = 0;
    let aggregatedRentCost = 0;
    let aggregatedSalaryCost = 0;
    let aggregatedAdCost = 0;
    let aggregatedRoyaltyCost = 0;
    let aggregatedMiscCost = 0;
    let aggregatedStudentsBefore = 0;
    let aggregatedStudentsAfter = 0;
    let aggregatedSatisfactionBefore = 0;
    let aggregatedSatisfactionAfter = 0;
    const campusSummaries = [];
    const campusCount = this.player.campuses.length;

    this.player.campuses.forEach((campus) => {
      const previousStudentCount = campus.studentCount;
      const previousSatisfaction = campus.satisfaction;
      aggregatedStudentsBefore += previousStudentCount;
      aggregatedSatisfactionBefore += previousSatisfaction;
      this.applyPendingAdPlan(campus);
      this.applyMonthlyStudentFlow(campus);
      this.ensureCapacity(campus, { allowHire: false });
      const studentDelta = campus.studentCount - previousStudentCount;
      aggregatedStudentsAfter += campus.studentCount;

      const revenue = previousStudentCount * campus.tuitionPerStudent;
      const salaryCost = campus.teachers.reduce((sum, t) => sum + t.baseSalary, 0);
      const rentCost = campus.rentCost;
      const adCost = campus.adCost;
      const royaltyCost = campus.royaltyCost;
      const miscCost = Math.round(revenue * MISC_EXPENSE_RATE);
      const totalCost = rentCost + salaryCost + adCost + royaltyCost + miscCost;
      const profit = revenue - totalCost;

      campus.lastFinancialSnapshot = {
        revenue,
        salaryCost,
        rentCost,
        adCost,
        royaltyCost,
        miscCost,
        profit,
      };

      campus.satisfaction = this.calculateNextSatisfaction(campus, { studentDelta });
      const satisfactionDelta = campus.satisfaction - previousSatisfaction;
      aggregatedSatisfactionAfter += campus.satisfaction;

      aggregatedRevenue += revenue;
      aggregatedCost += totalCost;
      aggregatedRentCost += rentCost;
      aggregatedSalaryCost += salaryCost;
      aggregatedAdCost += adCost;
      aggregatedRoyaltyCost += royaltyCost;
      aggregatedMiscCost += miscCost;
      this.player.funds += profit;

      campusSummaries.push({
        id: campus.id,
        name: campus.name,
        revenue,
        rentCost,
        salaryCost,
        adCost,
        royaltyCost,
        miscCost,
        cost: totalCost,
        profit,
        studentCount: campus.studentCount,
        studentDelta,
        satisfaction: campus.satisfaction,
        satisfactionDelta,
        adPlanLabel: campus.adPlan?.label ?? "広告なし",
        intakeCapacity: campus.intakeCapacity,
      });
    });

    const totalProfit = aggregatedRevenue - aggregatedCost;

    this.player.revenueHistory.push({
      year: currentYear,
      month: currentMonth,
      revenue: aggregatedRevenue,
      cost: aggregatedCost,
      profit: totalProfit,
    });

    const fundsAfter = this.player.funds;

    this.player.advanceMonth();

    const result = {
      year: currentYear,
      month: currentMonth,
      totalRevenue: aggregatedRevenue,
      totalCost: aggregatedCost,
      totalProfit,
      fundsAfter,
      fundsBefore,
      breakdown: {
        rentCost: aggregatedRentCost,
        salaryCost: aggregatedSalaryCost,
        adCost: aggregatedAdCost,
        royaltyCost: aggregatedRoyaltyCost,
        miscCost: aggregatedMiscCost,
      },
      studentsBefore: aggregatedStudentsBefore,
      studentsAfter: aggregatedStudentsAfter,
      studentDelta: aggregatedStudentsAfter - aggregatedStudentsBefore,
      campuses: campusSummaries,
      avgSatisfactionBefore:
        campusCount > 0 ? aggregatedSatisfactionBefore / campusCount : 0,
      avgSatisfactionAfter:
        campusCount > 0 ? aggregatedSatisfactionAfter / campusCount : 0,
      avgSatisfactionDelta:
        campusCount > 0
          ? aggregatedSatisfactionAfter / campusCount - aggregatedSatisfactionBefore / campusCount
          : 0,
    };
    if (this.didReachCampaignEnd(result)) {
      this.player.isCampaignComplete = true;
      result.isCampaignEnd = true;
    }
    return result;
  }

  applyPendingAdPlan(campus) {
    if (!campus.nextAdPlan) {
      return;
    }
    campus.adPlan = campus.nextAdPlan;
    campus.nextAdPlan = null;
  }

  applyMonthlyStudentFlow(campus) {
    const baseInflow = Math.round(campus.marketStudents * MONTHLY_INFLOW_COEFF);
    const satisfactionFactor = this.getSatisfactionFlowFactor(campus.satisfaction);
    const stationBoost = 1 + campus.stationTraffic * STATION_TRAFFIC_AD_COEFF;
    const adEffect = 1 + (campus.adPlan?.effect ?? 0) * stationBoost;
    const inflow = Math.max(0, Math.round(baseInflow * satisfactionFactor * adEffect));
    const attrition = Math.round(campus.studentCount * MONTHLY_ATTRITION_RATIO);
    const randomShake = Math.round((Math.random() * 2 - 1) * MONTHLY_RANDOM_SHAKE);
    const nextCount = campus.studentCount - attrition + inflow + randomShake;
    const adjusted = Math.max(0, nextCount);
    campus.studentCount = this.clampToIntakeCapacity(campus, adjusted);
  }

  clampToIntakeCapacity(campus, value) {
    if (!campus) {
      return value;
    }
    const cap = campus.intakeCapacity;
    if (!Number.isFinite(cap)) {
      return value;
    }
    return Math.min(value, cap);
  }

  calculateNextSatisfaction(campus, { studentDelta = 0 } = {}) {
    const teacherBonus = campus.teachers.reduce((sum, t) => sum + t.satisfactionImpact, 0);
    const loadFactor = campus.totalCapacity ? campus.studentCount / campus.totalCapacity : 1;
    const loadPenalty = loadFactor > 1 ? -5 * (loadFactor - 1) : 0;
    const randomShake = (Math.random() * 2 - 1) * RANDOM_SHAKE_RANGE;
    const growthBonus = this.getGrowthSatisfactionAdjustment(studentDelta);
    const components = [teacherBonus, loadPenalty, randomShake, growthBonus];
    let positiveDelta = 0;
    let negativeDelta = 0;
    components.forEach((value) => {
      if (value > 0) {
        positiveDelta += value;
      } else {
        negativeDelta += value;
      }
    });

    const dampingFactor = this.getSatisfactionGrowthDamping(campus.satisfaction);
    const adjustedPositive = positiveDelta * dampingFactor;
    const totalDelta = adjustedPositive + negativeDelta;
    const next = campus.satisfaction + totalDelta;
    return Math.max(SATISFACTION_MIN, Math.min(SATISFACTION_MAX, next));
  }

  getSatisfactionFlowFactor(value) {
    const normalized = 1 + value / 100;
    const clamped = Math.max(
      MIN_SATISFACTION_FLOW_FACTOR,
      Math.min(MAX_SATISFACTION_FLOW_FACTOR, normalized)
    );
    return clamped;
  }

  getGrowthSatisfactionAdjustment(studentDelta) {
    if (!Number.isFinite(studentDelta) || studentDelta === 0) {
      return 0;
    }
    const adjustment = studentDelta * STUDENT_GROWTH_SATISFACTION_FACTOR;
    if (studentDelta > 0) {
      return Math.min(STUDENT_GROWTH_SATISFACTION_MAX, adjustment);
    }
    return Math.max(-STUDENT_GROWTH_SATISFACTION_MAX, adjustment);
  }

  getSatisfactionGrowthDamping(currentValue) {
    if (!Number.isFinite(currentValue)) {
      return 1;
    }
    const aboveThreshold = Math.max(0, currentValue - SATISFACTION_DAMP_THRESHOLD);
    const damping = Math.exp(-aboveThreshold / SATISFACTION_DAMP_DECAY);
    const clamped = Math.max(0.05, Math.min(1, damping));
    return clamped;
  }

  getAdPlans() {
    return AD_PLANS;
  }

  scheduleAdPlan(campusId, planId) {
    const campus = this.getCampus(campusId);
    const requestedPlan = planId ? AD_PLAN_MAP[planId] : AD_PLAN_MAP.none;
    if (!requestedPlan) {
      throw new Error("無効な広告プランです。");
    }
    const nextPlan = requestedPlan;
    campus.nextAdPlan = campus.adPlan && campus.adPlan.id === nextPlan.id ? null : nextPlan;
    return { activePlan: campus.adPlan, nextPlan: campus.nextAdPlan };
  }

  openNewCampus(campusId, options = {}) {
    if (!this.player) {
      throw new Error("ゲームが開始されていません。");
    }
    if (this.player.campuses.some((c) => c.id === campusId)) {
      throw new Error("すでに開校済みです。");
    }
    const campus = this.createCampusInstance(campusId);
    if (this.player.funds < campus.openingCost) {
      throw new Error("開校資金が不足しています。");
    }
    this.player.funds -= campus.openingCost;
    this.seedCampus(campus, {
      initialTeacherTemplateId: options.initialTeacherTemplateId,
    });
    this.player.campuses.push(campus);
    return campus;
  }

  getCampus(campusId) {
    if (!this.player) {
      throw new Error("プレイヤーが存在しません。");
    }
    const campus = this.player.campuses.find((c) => c.id === campusId);
    if (!campus) {
      throw new Error(`校舎が見つかりません: ${campusId}`);
    }
    return campus;
  }

  getAvailableCampusDefs() {
    if (!this.player) {
      return this.campusCatalog;
    }
    const openedIds = new Set(this.player.campuses.map((c) => c.id));
    return this.campusCatalog.filter((c) => !openedIds.has(c.id));
  }

  resolveAdPlan(planId) {
    return AD_PLAN_MAP[planId] || AD_PLAN_MAP.none;
  }

  didReachCampaignEnd(summary) {
    if (!summary) {
      return false;
    }
    return summary.year === CAMPAIGN_END_YEAR && summary.month === CAMPAIGN_END_MONTH;
  }

  isCampaignComplete() {
    return Boolean(this.player?.isCampaignComplete);
  }

  toSerializable() {
    if (!this.player) {
      return null;
    }

    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      teacherCursor: this.teacherCursor,
      player: {
        name: this.player.name,
        schoolName: this.player.schoolName,
        funds: this.player.funds,
        year: this.player.year,
        month: this.player.month,
        elapsedMonths: this.player.elapsedMonths,
        isCampaignComplete: this.player.isCampaignComplete,
        revenueHistory: this.player.revenueHistory,
        campuses: this.player.campuses.map((campus) => ({
          id: campus.id,
          studentCount: campus.studentCount,
          satisfaction: campus.satisfaction,
          adPlanId: campus.adPlan?.id ?? "none",
          nextAdPlanId: campus.nextAdPlan?.id ?? null,
          teachers: campus.teachers.map((t) => ({
            id: t.id,
            templateId: t.templateId,
            name: t.name,
            rank: t.rank,
            baseSalary: t.baseSalary,
            satisfactionImpact: t.satisfactionImpact,
            gender: t.gender,
            specialty: t.specialty,
            personality: t.personality,
          })),
          classrooms: campus.classrooms.map((cls) => ({
            id: cls.id,
            campusId: cls.campusId,
            teacherId: cls.teacherId,
            capacity: cls.capacity,
            studentCount: cls.studentCount,
          })),
        })),
      },
    };
  }

  loadFromSerializable(payload) {
    if (!payload?.player) {
      throw new Error("保存データが不正です。");
    }

    const version = payload.version ?? 1;

    const player = new Player({
      name: payload.player.name,
      schoolName: payload.player.schoolName,
      funds: payload.player.funds,
      year: payload.player.year,
      month: payload.player.month,
    });

    player.elapsedMonths = payload.player.elapsedMonths ?? 0;
    player.isCampaignComplete = Boolean(payload.player.isCampaignComplete);
    player.revenueHistory = payload.player.revenueHistory || [];
    player.campuses = payload.player.campuses.map((campusData) => {
      const campus = this.createCampusInstance(campusData.id);
      campus.studentCount = campusData.studentCount;
      campus.satisfaction = this.normalizeSatisfactionValue(campusData.satisfaction, version);
      campus.adPlan = this.resolveAdPlan(campusData.adPlanId);
      campus.nextAdPlan = campusData.nextAdPlanId ? this.resolveAdPlan(campusData.nextAdPlanId) : null;
      campus.teachers = (campusData.teachers || []).map((t) => new Teacher(t));
      campus.classrooms = (campusData.classrooms || []).map((cls) => new Classroom(cls));
      return campus;
    });

    this.player = player;
    this.teacherCursor = payload.teacherCursor || 0;
  }

  saveToStorage(slotId) {
    const serializable = this.toSerializable();
    if (!serializable) {
      return false;
    }
    const key = getSlotStorageKey(slotId);
    try {
      localStorage.setItem(key, JSON.stringify(serializable));
      return true;
    } catch (error) {
      console.error("セーブに失敗しました", error);
      return false;
    }
  }

  loadFromStorage(slotId) {
    const key = getSlotStorageKey(slotId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return false;
      }
      const payload = JSON.parse(raw);
      this.loadFromSerializable(payload);
      return true;
    } catch (error) {
      console.error("ロードに失敗しました", error);
      return false;
    }
  }

  listSaveSlots() {
    return SAVE_SLOT_IDS.map((slotId) => this.getSaveSlotInfo(slotId));
  }

  hasAnySaveData() {
    return this.listSaveSlots().some((slot) => slot.hasData);
  }

  getSaveSlotInfo(slotId) {
    const normalized = normalizeSlotId(slotId);
    const key = getSlotStorageKey(normalized);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return { id: normalized, hasData: false };
      }
      const payload = JSON.parse(raw);
      return {
        id: normalized,
        hasData: true,
        summary: this.extractSaveSummary(payload),
      };
    } catch (error) {
      console.error(`スロット${normalized}の確認中にエラー`, error);
      return { id: normalized, hasData: false, error: true };
    }
  }

  extractSaveSummary(payload) {
    if (!payload?.player) {
      return null;
    }
    const campuses = Array.isArray(payload.player.campuses) ? payload.player.campuses.length : 0;
    return {
      playerName: payload.player.name || "不明なプレイヤー",
      schoolName: payload.player.schoolName || "名称未設定",
      funds: payload.player.funds ?? 0,
      year: payload.player.year ?? 1,
      month: payload.player.month ?? 4,
      elapsedMonths: payload.player.elapsedMonths ?? 0,
      campusCount: campuses,
      savedAt: payload.savedAt || null,
    };
  }

  getTeacherTemplate(templateId) {
    return this.teacherTemplates.find((t) => t.id === templateId) || null;
  }

  normalizeSatisfactionValue(value, version) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return NEUTRAL_SATISFACTION;
    }
    const migrated = version <= 1 ? value - 50 : value;
    return Math.max(SATISFACTION_MIN, Math.min(SATISFACTION_MAX, migrated));
  }
}
