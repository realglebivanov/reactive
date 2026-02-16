import type { Observable, Observer, Values } from "..";
import { Notifier } from "../notifier";
import { scheduler, type Schedulable } from "../scheduler";
import { type State, Uninitialized } from "./state";

export const mapObservable = <
    Observables extends readonly Observable<any>[],
    R
>(
    mapFn: (...values: Values<Observables>) => R,
    ...observables: Observables
): MapObservable<Observables, R> =>
    new MapObservable(mapFn, observables);

class MapObservable<
    Observables extends readonly Observable<any>[],
    R
> implements Observable<R>, Schedulable {
    private notifier = new Notifier<R>();
    private state: State<Observables, R>;
    private ids: symbol[];

    constructor(
        private mapFn: (...values: Values<Observables>) => R,
        private observables: Observables
    ) {
        this.ids = Array.from(this.observables, () => Symbol("MapObservable"));
        this.state = new Uninitialized(this.ids.length, mapFn)
    }

    unsubscribeAll(): void {
        this.notifier.clear();
        this.innerUnubscribe();
    }

    unsubscribe(id: symbol): void {
        this.notifier.delete(id);
        this.innerUnubscribe();
    }

    subscribe(id: symbol, observer: Observer<R>): void {
        this.notifier.set(id, observer);
        this.innerSubscribe();
    }

    subscribeInit(id: symbol, observer: Observer<R>): void {
        this.subscribe(id, observer);
        this.notifier.scheduleNotify(id);
        scheduler.enqueueInit(this);
    }

    run(): void {
        if (this.state instanceof Uninitialized) return;
        this.notifier.notifyTargets(this.state.value);
        this.notifier.resetTargets();
    }

    private notifyObservers(i: keyof Observables) {
        return (newValue: Values<Observables>[keyof Observables]) => {
            this.state = this.state.update(i, newValue);
            if (this.state instanceof Uninitialized) return;
            this.notifier.scheduleNotifyAll();
            scheduler.enqueueUpdate(this);
        };
    }

    private innerSubscribe() {
        if (this.notifier.size !== 1) return;
        for (const [i, observable] of this.observables.entries())
            if (this.ids[i] !== undefined)
                observable.subscribeInit(this.ids[i], this.notifyObservers(i));
    }

    private innerUnubscribe() {
        if (this.notifier.size !== 0) return;
        for (const [i, observable] of this.observables.entries()) {
            if (this.ids[i] !== undefined)
                observable.unsubscribe(this.ids[i]);
        }
        this.state = new Uninitialized(this.ids.length, this.mapFn);
    }
}
