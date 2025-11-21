export const CLASS_CAPACITY = 80;
export const ROYALTY_PER_CAMPUS = 200_000;

export class Campus {
  constructor({
    id,
    name,
    marketStudents,
    rent,
    stationTraffic,
    tuitionPerStudent,
    openingCost,
    intakeCapacity,
  }) {
    this.id = id;
    this.name = name;
    this.marketStudents = marketStudents;
    this.rent = rent;
    this.stationTraffic = stationTraffic;
    this.tuitionPerStudent = tuitionPerStudent;
    this.openingCost = openingCost ?? 5_000_000;
    this.intakeCapacity = Number.isFinite(intakeCapacity) ? intakeCapacity : Infinity;

    this.studentCount = 0;
    this.satisfaction = 0;
    this.teachers = [];
    this.classrooms = [];
    this.adPlan = null;
    this.nextAdPlan = null;
  }

  get rentCost() {
    return Math.round(this.rent * 10_000);
  }

  get adCost() {
    return this.adPlan?.cost ?? 0;
  }

  get royaltyCost() {
    return ROYALTY_PER_CAMPUS;
  }

  get totalCapacity() {
    return this.classrooms.length * CLASS_CAPACITY;
  }

  get requiredClassroomCount() {
    return Math.ceil(this.studentCount / CLASS_CAPACITY) || 0;
  }
}
