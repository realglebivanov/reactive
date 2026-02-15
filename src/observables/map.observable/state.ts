import type { Observable, Values } from "..";

export type State<O extends readonly Observable<any>[]> =
    Initialized<O> | Uninitialized<O>;

type PartialArray<V extends readonly any[]> = {
    [K in keyof V]?: V[K];
};

export class Initialized<O extends readonly Observable<any>[]> {
    constructor(public values: Values<O>) { }

    public update<K extends keyof O>(i: K, value: Values<O>[K]): Initialized<O> {
        this.values[i] = value;
        return this;
    }
}

export class Uninitialized<O extends readonly Observable<any>[]> {
    private initializedIndices = new Set();
    public values: PartialArray<Values<O>>;

    constructor(private initializedSize: number) {
        this.values = new Array(initializedSize).fill(undefined) as PartialArray<Values<O>>;
    }

    public update<K extends keyof O>(i: K, value: Values<O>[K]): Uninitialized<O> | Initialized<O> {
        this.initializedIndices.add(i);
        this.values[i] = value;

        if (this.initializedIndices.size === this.initializedSize)
            return new Initialized(this.values as Values<O>);
        else
            return this;
    }
}
