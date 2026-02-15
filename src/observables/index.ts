import { mapObservable } from "./map.observable";

export type Observer<T> = (value: T) => void;
export type UpdateFn<T> = (value: T) => T;

export interface Observable<T> {
    unsubscribeAll(): void;
    unsubscribe(id: symbol): void;
    subscribe(id: symbol, observer: Observer<T>): void;
    subscribeInit(id: symbol, observer: Observer<T>): void;
}

export interface Updatable<T> {
    update(updateFn: UpdateFn<T>): void;
}

export type ObservableValue<O extends Observable<any>> =
    O extends Observable<infer T> ? T : never;

export type Values<
    Observables extends readonly Observable<any>[]
> = { [K in keyof Observables]: ObservableValue<Observables[K]> };

export const once = <T extends any[]>(
    fn: (...values: T) => void, 
    ...observables: { [K in keyof T]: Observable<T[K]> }) => {
    const id = Symbol('Once');
    const observable = mapObservable((...values) => values, ...observables);
    observable.subscribeInit(id, (values: T) => {
        observable.unsubscribe(id);
        fn(...values);
    });
};

export * from "./value.observable";
export * from "./map.observable";
export * from "./dedup.observable";
export * from "./scoped.observable";
export * from "./input.observable";
