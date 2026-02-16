import type { Observable, Values } from "..";

export type State<O extends readonly Observable<any>[], R> =
    Initialized<O, R> | Uninitialized<O, R>;

type PartialArray<V extends readonly any[]> = {
    [K in keyof V]?: V[K];
};

export class Initialized<O extends readonly Observable<any>[], R> {
    private currentValue: R;

    constructor(
        private values: Values<O>, 
        private mapFn: (...values: Values<O>) => R
    ) {
        this.currentValue = mapFn(...values);
    }

    get value(): R {
        return this.currentValue;
    }

    public update<K extends keyof O>(i: K, value: Values<O>[K]): Initialized<O, R> {
        this.values[i] = value;
        this.currentValue = this.mapFn(...this.values);
        return this;
    }
}

export class Uninitialized<O extends readonly Observable<any>[], R> {
    private initializedIndices = new Set();
    public values: PartialArray<Values<O>>;

    constructor(
        private initializedSize: number,
        private mapFn: (...values: Values<O>) => R
    ) {
        this.values = new Array(initializedSize).fill(undefined) as PartialArray<Values<O>>;
    }

    public update<K extends keyof O>(i: K, value: Values<O>[K]): State<O, R> {
        this.initializedIndices.add(i);
        this.values[i] = value;

        if (this.initializedIndices.size === this.initializedSize)
            return new Initialized(this.values as Values<O>, this.mapFn);
        else
            return this;
    }
}
