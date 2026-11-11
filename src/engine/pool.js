/**
 * ASTRAL ZERO — High-performance object pool for zero-GC gameplay loops.
 * Eliminates garbage collector stutter by pre-allocating reusable entity instances.
 * Rewritten in the new style. Raw mechanical utility only.
 */

export class ObjectPool {
  constructor(factoryFn, initialSize = 64, maxCapacity = 512) {
    this.factoryFn = factoryFn;
    this.maxCapacity = maxCapacity;
    this.freeList = [];
    this.activeList = [];

    for (let i = 0; i < initialSize; i++) {
      this.freeList.push(this.factoryFn());
    }
  }

  obtain() {
    let item;
    if (this.freeList.length > 0) {
      item = this.freeList.pop();
    } else if (this.activeList.length < this.maxCapacity) {
      item = this.factoryFn();
    } else {
      item = this.activeList.shift();
    }
    item.active = true;
    this.activeList.push(item);
    return item;
  }

  release(item) {
    const idx = this.activeList.indexOf(item);
    if (idx !== -1) {
      this.activeList.splice(idx, 1);
      item.active = false;
      this.freeList.push(item);
    }
  }

  releaseAll() {
    while (this.activeList.length > 0) {
      const item = this.activeList.pop();
      item.active = false;
      this.freeList.push(item);
    }
  }

  forEach(callback) {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      callback(this.activeList[i], i);
    }
  }

  get activeCount() { return this.activeList.length; }
}
