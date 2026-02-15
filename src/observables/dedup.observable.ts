import type { Observable, Observer } from ".";
import { Notifier } from "./notifier";
import { scheduler, type Schedulable } from "./scheduler";

export const dedupObservable = <T>(
    innerObservable: Observable<T>,
    compareEqualFn: CompareEqualFn<T> = (a, b) => a == b,
    cloneFn: CloneFn<T> = (a) => a
) => new DedupObservable(innerObservable, compareEqualFn, cloneFn);

type CompareEqualFn<T> = (a: T, b: T) => boolean;
type CloneFn<T> = (a: T) => T;
type State<T> = { initialized: false } | { initialized: true, value: T };

class DedupObservable<T> implements Observable<T>, Schedulable {
    private id = Symbol('DedupObservable');
    private state: State<T> = { initialized: false };
    private boundUpdate = this.updateValue.bind(this);
    private notifier = new Notifier<T>();

    constructor(
        private innerObservable: Observable<T>,
        private compareEqualFn: CompareEqualFn<T>,
        private cloneFn: CloneFn<T>
    ) { }

    unsubscribeAll() {
        this.notifier.clear();
        this.innerUnubscribe();
    }

    unsubscribe(id: symbol) {
        this.notifier.delete(id);
        this.innerUnubscribe();
    }

    subscribe(id: symbol, observer: Observer<T>) {
        this.notifier.set(id, observer);
        this.innerSubscribe();
    }

    subscribeInit(id: symbol, observer: Observer<T>) {
        this.subscribe(id, observer);
        this.notifier.scheduleNotify(id);
        scheduler.enqueueSubscription(this);
    }

    run(): void {
        if (!this.state.initialized) return;
        this.notifier.notifyTargets(this.state.value);
        this.notifier.resetTargets();
    }

    private innerSubscribe() {
        if (this.notifier.size !== 1) return;
        this.innerObservable.subscribeInit(this.id, this.boundUpdate);
    };

    private updateValue(value: T) {
        if (this.state.initialized && this.compareEqualFn(this.state.value, value))
            return;

        if (this.state.initialized)
            this.state.value = this.cloneFn(value);
        else
            this.state = { initialized: true, value: this.cloneFn(value) };
        
        this.notifier.scheduleNotifyAll();
        scheduler.enqueueUpdate(this);
    }

    private innerUnubscribe() {
        if (this.notifier.size !== 0) return;
        this.state = { initialized: false };
        this.innerObservable.unsubscribe(this.id);
    }
}
