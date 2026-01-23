export type Observer<T> = (value: T) => void;
export type UpdateFn<T> = (value: T) => T;

export interface Observable<T> {
    unsubscribeAll(): void;
    unsubscribe(id: symbol): void;
    subscribe(id: symbol, observer: Observer<T>): void;
    subscribeInit(id: symbol, observer: Observer<T>): void;
}

export * from "./value.observable";
export * from "./map.observable";
export * from "./dedup.observable";
