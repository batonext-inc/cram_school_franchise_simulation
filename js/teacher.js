export class Teacher {
  constructor({ id, templateId, name, rank, baseSalary, satisfactionImpact, gender, specialty, personality }) {
    this.id = id;
    this.templateId = templateId || null;
    this.name = name;
    this.rank = rank; // 'senior' | 'mid' | 'junior'
    this.baseSalary = baseSalary;
    this.satisfactionImpact = satisfactionImpact;
    this.gender = gender || null;
    this.specialty = specialty || null;
    this.personality = personality || null;
  }

  cloneWithId(newId) {
    return new Teacher({
      id: newId,
      templateId: this.templateId,
      name: this.name,
      rank: this.rank,
      baseSalary: this.baseSalary,
      satisfactionImpact: this.satisfactionImpact,
      gender: this.gender,
      specialty: this.specialty,
      personality: this.personality,
    });
  }
}
