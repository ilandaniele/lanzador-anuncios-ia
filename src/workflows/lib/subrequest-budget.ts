export const CONTINUATION_THRESHOLD = 45;

export class SubrequestBudget {
  #used = 0;

  get used() {
    return this.#used;
  }

  charge(count = 1) {
    this.#used += count;
  }

  needsContinuation() {
    return this.#used >= CONTINUATION_THRESHOLD;
  }
}
