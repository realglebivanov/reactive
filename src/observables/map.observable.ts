import type { Observable, Observer } from ".";

type ObservableValue<O extends Observable<any>> =
    O extends Observable<infer T> ? T : never;

type Values<
    Observables extends readonly Observable<any>[]
> = { [K in keyof Observables]: ObservableValue<Observables[K]> };

export const mapObservable = <
    Observables extends readonly Observable<any>[],
    R
>(
    mapFn: (...values: Values<Observables>) => R,
    ...observables: Observables
): MapObservable<Observables, R> =>
    new MapObservable(mapFn, observables);

class MapObservable<Observables extends readonly Observable<any>[], R> {
    private observers = new Map<symbol, Observer<R>>();
    private initializedIndices = new Set<keyof Observables>();

    private ids!: { [_K in keyof Observables]: symbol };
    private currentValues!: Partial<Values<Observables>>;

    constructor(
        private mapFn: (...values: Values<Observables>) => R,
        private observables: Observables
    ) {
        this.ids = observables.map((_) => Symbol(`MapObservable`)) as
            { [_K in keyof Observables]: symbol };
        this.currentValues = [] as Partial<Values<Observables>>;
    }

    unsubscribeAll() {
        this.observers.clear();
        this.innerUnubscribe();
    }

    unsubscribe(id: symbol) {
        this.observers.delete(id);
        this.innerUnubscribe();
    }

    subscribe(id: symbol, observer: Observer<R>) {
        this.observers.set(id, observer);
        this.innerSubscribe();
    }

    subscribeInit(id: symbol, observer: Observer<R>) {
        this.subscribe(id, observer);
    }

    private notifyObservers(i: keyof Observables) {
        return (newValue: Values<Observables>[keyof Observables]) => {
            this.currentValues[i] = newValue;
            this.initializedIndices.add(i);

            if (this.initializedIndices.size === this.currentValues.length)
                for (const observer of this.observers.values())
                    observer(this.mapFn(...this.currentValues as Values<Observables>));
        };
    }

    private innerSubscribe() {
        if (this.observers.size !== 1) return;
        for (const [i, observable] of this.observables.entries()) {
            observable.subscribeInit(
                this.ids[i as keyof Observables],
                this.notifyObservers(i));
        }
    };

    private innerUnubscribe() {
        if (this.observers.size !== 0) return;
        for (const [i, observable] of this.observables.entries()) {
            observable.unsubscribe(this.ids[i as keyof Observables]);
        }
    };
}
