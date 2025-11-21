export class Classroom {
  constructor({ id, campusId, teacherId, capacity = 80, studentCount = 0 }) {
    this.id = id;
    this.campusId = campusId;
    this.teacherId = teacherId;
    this.capacity = capacity;
    this.studentCount = studentCount;
  }

  get isOverCapacity() {
    return this.studentCount > this.capacity;
  }
}
