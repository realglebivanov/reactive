import type { Observable, Observer, UpdateFn } from ".";
import { microtaskRunner, type TaskRunner } from "..";

export const observable = <T>(
    value: T,
    opts: { microtaskRunner: TaskRunner } | undefined
) => new ValueObservable(value, opts);

class ValueObservable<T> implements Observable<T> {
    private readonly observers = new Map<symbol, Observer<T>>();

    constructor(
        private value: T,
        private opts = { microtaskRunner }
    ) { }

    unsubscribeAll() {
        this.observers.clear();
    }
    unsubscribe(id: symbol) {
        this.observers.delete(id);
    }
    subscribe(id: symbol, observer: Observer<T>) {
        if (this.observers.has(id))
            console.warn("Duplicate observer id", id);
        this.observers.set(id, observer);
    }
    subscribeInit(id: symbol, observer: Observer<T>) {
        this.subscribe(id, observer);
        this.opts.microtaskRunner(() => this.notify(id, observer));
    }
    update(updateFn: UpdateFn<T>) {
        this.value = updateFn(this.value);
        this.opts.microtaskRunner(this.notifyAll.bind(this));
    }

    private notify(id: symbol, observer: Observer<T>) {
        try {
            if (this.observers.get(id) === observer) observer(this.value);
        } catch (e) {
            console.error(e);
        }
    };

    private notifyAll() {
        for (const [id, observer] of this.observers.entries())
            this.notify(id, observer);
    };
}

