import type { Observable, Observer } from ".";

export const dedupObservable = <T>(
    innerObservable: Observable<T>,
    compareEqualFn: CompareEqualFn<T> = (a, b) => a == b,
    cloneFn: CloneFn<T> = (a) => a
) => new DedupObservable(innerObservable, compareEqualFn, cloneFn);

type CompareEqualFn<T> = (a: T, b: T) => boolean;
type CloneFn<T> = (a: T) => T;

class DedupObservable<T> implements Observable<T> {
    private id = Symbol('DedupObservable');
    private currentValue: T | undefined = undefined;
    private isInitialized = false;
    private observers = new Map();

    constructor(
        private innerObservable: Observable<T>,
        private compareEqualFn: CompareEqualFn<T>,
        private cloneFn: CloneFn<T>
    ) { }

    unsubscribeAll() {
        this.observers.clear();
        this.innerUnubscribe();
    }

    unsubscribe(id: symbol) {
        this.observers.delete(id);
        this.innerUnubscribe();
    }

    subscribe(id: symbol, observer: Observer<T>) {
        this.observers.set(id, observer);
        this.innerSubscribe();
    }

    subscribeInit(id: symbol, observer: Observer<T>) {
        this.subscribe(id, observer);
        if (this.observers.size === 1 || !this.isInitialized) return;
        observer(this.currentValue as T);
    }

    private innerSubscribe() {
        if (this.observers.size !== 1) return;
        this.innerObservable.subscribeInit(
            this.id, this.updateValue.bind(this));
    };

    private updateValue(value: T) {
        if (this.isInitialized && this.compareEqualFn(this.currentValue as T, value)) 
            return;

        this.currentValue = this.cloneFn(value), this.isInitialized = true;

        for (const observer of this.observers.values())
            observer(this.currentValue);
    }

    private innerUnubscribe() {
        if (this.observers.size !== 0) return;
        this.currentValue = undefined;
        this.isInitialized = false;
        this.innerObservable.unsubscribe(this.id);
    };
}
