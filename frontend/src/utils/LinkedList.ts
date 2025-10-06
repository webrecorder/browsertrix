/**
 * Based on https://github.com/solancer/two-way-map/tree/v1.0.3/src
 */

export interface ILinkedListNode<T> {
  value: T;
  next: ILinkedListNode<T> | null;
  prev: ILinkedListNode<T> | null;
}

export class LinkedList<T> {
  private head: ILinkedListNode<T> | null = null;
  private tail: ILinkedListNode<T> | null = null;

  add(value: T): void {
    const newNode: ILinkedListNode<T> = { value, next: null, prev: this.tail };

    if (!this.head) {
      this.head = newNode;
    } else if (this.tail) {
      this.tail.next = newNode;
    }

    this.tail = newNode;
  }

  remove(value: T): void {
    let current = this.head;

    while (current) {
      if (current.value === value) {
        if (current.prev) {
          current.prev.next = current.next;
        } else {
          this.head = current.next;
        }

        if (current.next) {
          current.next.prev = current.prev;
        } else {
          this.tail = current.prev;
        }

        return;
      }

      current = current.next;
    }
  }

  toArray(): T[] {
    const array: T[] = [];
    let current = this.head;

    while (current) {
      array.push(current.value);
      current = current.next;
    }

    return array;
  }

  getFirst(): T | undefined {
    return this.head?.value;
  }

  getLast(): T | undefined {
    return this.tail?.value;
  }

  clear(): void {
    this.head = null;
    this.tail = null;
  }
}
