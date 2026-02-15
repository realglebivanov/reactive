import type { Observable, Observer, Updatable, UpdateFn } from ".";
import { Notifier } from "./notifier";
import { scheduler, type Schedulable } from "./scheduler";

export const observable = <T>(
    value: T
): ValueObservable<T> => new ValueObservable(value);

class ValueObservable<T> implements Observable<T>, Updatable<T>, Schedulable {
    private readonly notifier = new Notifier<T>();

    constructor(private value: T) { }

    unsubscribeAll(): void {
        this.notifier.clear();
    }

    unsubscribe(id: symbol): void {
        this.notifier.delete(id);
    }

    subscribe(id: symbol, observer: Observer<T>): void {
        this.notifier.set(id, observer);
    }

    subscribeInit(id: symbol, observer: Observer<T>): void {
        this.notifier.set(id, observer);
        this.notifier.scheduleNotify(id);
        scheduler.enqueueSubscription(this);
    }

    update(updateFn: UpdateFn<T>): void {
        this.value = updateFn(this.value);
        this.notifier.scheduleNotifyAll();
        scheduler.enqueueUpdate(this);
    }

    run(): void {
        this.notifier.notifyTargets(this.value);
        this.notifier.resetTargets();
    }
}

