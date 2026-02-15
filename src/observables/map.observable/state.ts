import type { Observable, Values } from "..";

export type State<O extends readonly Observable<any>[]> =
    InitializedState<O> | UninitializedState<O>;

type PartialArray<V extends readonly any[]> = {
    [K in keyof V]?: V[K];
};

export class InitializedState<O extends readonly Observable<any>[]> {
    constructor(public values: Values<O>) { }

    public update(i: keyof Values<O>, value: Values<O>[keyof Values<O>]) {
        this.values[i] = value;
        return this;
    }
}

export class UninitializedState<O extends readonly Observable<any>[]> {
    private initializedIndices = new Set();
    public values: PartialArray<Values<O>>;

    constructor(private initializedSize: number) {
        this.values = new Array(initializedSize).fill(undefined) as PartialArray<Values<O>>;
    }

    public update<K extends keyof O>(i: K, value: Values<O>[K]) {
        this.initializedIndices.add(i);
        this.values[i] = value;

        if (this.initializedIndices.size === this.initializedSize)
            return new InitializedState(this.values as Values<O>);
        else
            return this;
    }
}
