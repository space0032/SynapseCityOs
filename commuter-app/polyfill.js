if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function() {
    return this.slice().reverse();
  };
}

if (!Array.prototype.toSorted) {
  Array.prototype.toSorted = function(compareFn) {
    return this.slice().sort(compareFn);
  };
}

if (!Array.prototype.toSpliced) {
  Array.prototype.toSpliced = function(start, deleteCount, ...items) {
    var copy = this.slice();
    if (arguments.length === 1) {
      copy.splice(start);
    } else {
      copy.splice(start, deleteCount, ...items);
    }
    return copy;
  };
}

if (!Array.prototype.with) {
  Array.prototype.with = function(index, value) {
    var copy = this.slice();
    copy[index] = value;
    return copy;
  };
}
