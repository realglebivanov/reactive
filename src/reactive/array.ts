import { observable, type Observable, type Updatable } from "../observables";
import type { Event } from "../nodes";

type Source<T> = Observable<Event<T>> & Updatable<Event<T>>;

export class ReactiveArray<T> {
    private observables: WeakRef<Source<T>>[] = [];

    constructor(private items: T[] = []) { }

    get observable$(): Source<T> {
        const obs$ = observable<Event<T>>({ type: "replace", items: this.items });
        this.observables.push(new WeakRef(obs$));
        return obs$;
    };

    push(...items: T[]) {
        this.items.push(...items);
        this.emit({ type: "append", items: items })
    }

    pop(): T | undefined {
        if (this.items.length === 0) return undefined;

        const index = this.items.length - 1;
        const value = this.items.pop() as T;

        this.emit({ type: "remove", items: new Map().set(index, value) });

        return value;
    }

    remove(indices: number[]) {
        if (indices.length == 0) return;
        const eventItems = new Map();
        for (const idx of indices) {
            if (!(idx in this.items)) continue;
            eventItems.set(idx, this.items[idx]);
            delete this.items[idx];
        }
        this.emit({ type: "remove", items: eventItems });
    }

    replace(items: T[]) {
        this.items = items;
        this.emit({ type: "replace", items: items });
    }

    replaceKeys(items: Map<number, T>) {
        for (const [idx, value] of items.entries()) {
            if (!(idx in this.items)) continue;
            this.items[idx] = value;
        }

        this.emit({ type: "replaceKeys", items: items })
    }

    private emit(event: Event<T>) {
        const updateFn = (_: Event<T>) => event;
        for (const obs$ of this.observables)
            obs$.deref()?.update(updateFn);
    }
}
