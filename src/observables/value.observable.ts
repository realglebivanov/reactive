import type { Observable, Observer, Updatable, UpdateFn } from ".";
import { dedupMicrotaskRunner, type TaskRunner } from "../task";

export const observable = <T>(
    value: T,
    opts: { microtaskRunner: TaskRunner } = { microtaskRunner: dedupMicrotaskRunner }
): ValueObservable<T> => new ValueObservable(value, opts);

class ValueObservable<T> implements Observable<T>, Updatable<T> {
    private readonly observers = new Map<symbol, Observer<T>>();

    constructor(
        private value: T,
        private opts: { microtaskRunner: TaskRunner }
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
        this.notify(id, observer);
    }
    update(updateFn: UpdateFn<T>) {
        this.value = updateFn(this.value);
        this.opts.microtaskRunner(this.notifyAll.bind(this));
    }

    private notifyAll() {
        for (const [id, observer] of this.observers.entries()) 
            this.notify(id, observer);
    }

    private notify(id: symbol, observer: Observer<T>) {
        try {
            if (this.observers.get(id) === observer) observer(this.value);
        } catch (e) {
            console.error(e);
        }
    }
}

