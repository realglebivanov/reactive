import type { Observable, Observer, Updatable, UpdateFn } from ".";

export const scopedObservable = <T extends Observable<any>>(
    innerObservable: T
): ScopedObservable<T> => new ScopedObservable<T>(innerObservable);

type Value<O extends Observable<any>> =
    O extends Observable<infer T> ? T : never;

export class ScopedObservable<T extends Observable<any>> implements Observable<Value<T>> {
    private aliases = new Map<symbol, symbol>();

    constructor(
        private innerObservable: T
    ) { }

    unsubscribeAll(): void {
        for (const alias of this.aliases.values())
            this.innerObservable.unsubscribe(alias);
        this.aliases.clear();
    }

    unsubscribe(id: symbol): void {
        const alias = this.aliases.get(id);
        if (alias === undefined) return;
        this.aliases.delete(id);
        this.innerObservable.unsubscribe(alias);
    }

    subscribe(id: symbol, observer: Observer<Value<T>>): void {
        const alias = Symbol('ScopedObservable');
        this.aliases.set(id, alias);
        this.innerObservable.subscribe(alias, observer);
    }

    subscribeInit(id: symbol, observer: Observer<Value<T>>): void {
        const alias = Symbol('ScopedObservable');
        this.aliases.set(id, alias);
        this.innerObservable.subscribeInit(alias, observer);
    }

    update(
        this: ScopedObservable<Updatable<Value<T>> & Observable<Value<T>>>,
        updateFn: UpdateFn<Value<T>>
    ): void {
        if ('update' in this.innerObservable)
            (this.innerObservable as Updatable<Value<T>>).update(updateFn);
    }
}
