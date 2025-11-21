const INITIAL_FUNDS = 10_000_000;

export class Player {
  constructor({ name, schoolName, funds = INITIAL_FUNDS, year = 1, month = 4 }) {
    this.name = name;
    this.schoolName = schoolName;
    this.funds = funds;
    this.year = year;
    this.month = month;
    this.campuses = [];
    this.revenueHistory = [];
    this.elapsedMonths = 0;
    this.isCampaignComplete = false;
  }

  advanceMonth() {
    this.elapsedMonths += 1;
    this.month += 1;
    if (this.month > 12) {
      this.month = 1;
      this.year += 1;
    }
  }
}
