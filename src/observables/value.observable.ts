import type { Observable, Observer, Updatable, UpdateFn } from ".";
import { Notifier } from "./notifier";
import { scheduler, type Schedulable } from "./scheduler";

export const observable = <T>(
    value: T
): ValueObservable<T> => new ValueObservable(value);

class ValueObservable<T> implements Observable<T>, Updatable<T>, Schedulable {
    private readonly notifier = new Notifier<T>();

    constructor(private value: T) { }

    unsubscribeAll() {
        this.notifier.clear();
    }

    unsubscribe(id: symbol) {
        this.notifier.delete(id);
    }

    subscribe(id: symbol, observer: Observer<T>) {
        this.notifier.set(id, observer);
    }

    subscribeInit(id: symbol, observer: Observer<T>) {
        this.notifier.set(id, observer);
        this.notifier.scheduleNotify(id);
        scheduler.enqueueSubscription(this);
    }

    update(updateFn: UpdateFn<T>) {
        this.value = updateFn(this.value);
        this.notifier.scheduleNotifyAll();
        scheduler.enqueueUpdate(this);
    }

    run() {
        this.notifier.notifyTargets(this.value);
        this.notifier.resetTargets();
    }
}

