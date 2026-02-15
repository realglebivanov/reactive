import type { Observable, Observer, Values } from "..";
import { Notifier } from "../notifier";
import { scheduler, type Schedulable } from "../scheduler";
import { type State, UninitializedState } from "./state";

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
    private state: State<Observables>;
    private ids: symbol[];

    constructor(
        private mapFn: (...values: Values<Observables>) => R,
        private observables: Observables
    ) {
        this.ids = Array.from(this.observables, () => Symbol("MapObservable"));
        this.state = new UninitializedState(this.ids.length)
    }

    unsubscribeAll() {
        this.notifier.clear();
        this.innerUnubscribe();
    }

    unsubscribe(id: symbol) {
        this.notifier.delete(id);
        this.innerUnubscribe();
    }

    subscribe(id: symbol, observer: Observer<R>) {
        this.notifier.set(id, observer);
        this.innerSubscribe();
    }

    subscribeInit(id: symbol, observer: Observer<R>) {
        this.subscribe(id, observer);
        this.notifier.scheduleNotify(id);
        scheduler.enqueueSubscription(this);
    }

    run(): void {
        if (this.state instanceof UninitializedState) return;
        this.notifier.notifyTargets(this.mapFn(...this.state.values));
        this.notifier.resetTargets();
    }

    private notifyObservers(i: keyof Observables) {
        return (newValue: Values<Observables>[keyof Observables]) => {
            this.state = this.state.update(i, newValue);
            if (this.state instanceof UninitializedState) return;
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
        this.state = new UninitializedState(this.ids.length);
    }
}
