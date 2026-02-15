export class RingQueue<T> {
    private size = 0;
    private head = 0;
    private tail = 0;
    private items: Array<T | undefined>;

    constructor(capacity: number = 256) {
        this.items = new Array(capacity);
    }

    get isEmpty() {
        return this.size === 0;
    }

    clear() {
        this.size = 0;
        this.tail = 0;
        this.head = 0;
    }

    enqueue(item: T) {
        if (this.size === this.items.length) this.extend();

        this.items[this.tail] = item;
        this.tail = (this.tail + 1) % this.items.length;
        this.size++;
    }

    dequeue(): T | undefined {
        if (this.size === 0) return;

        const item = this.items[this.head];
        this.items[this.head] = undefined;
        this.head = (this.head + 1) % this.items.length;
        this.size--;

        return item;
    }

    private extend() {
        const newItems = new Array(this.size * 2);
        
        for (let i = 0; i < this.size; i++) 
            newItems[i] = this.items[(this.head + i) % this.items.length];

        this.items = newItems;
        this.head = 0;
        this.tail = this.size;
    }
}
