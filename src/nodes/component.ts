import {
    scopedObservable,
    ScopedObservable,
    type Observable
} from "../observables";
import { toReactiveNode, type ReactiveNode } from "./reactive";

type Observables<T> = { [K in keyof T]: Observable<T[K]> };

type ScopedObservables<T> = {
    [K in keyof T]: T[K] extends Observable<any> ?
    ScopedObservable<T[K]> :
    never
};

type RenderFn<O1 extends Observables<{}>, O2 extends Observables<{}>, T extends Node> =
    (observables: ScopedObservables<O1> & ScopedObservables<O2>) => ReactiveNode<T>;

type Params<O1 extends Observables<{}>, O2 extends Observables<{}>, T extends Node> = {
    render: RenderFn<O1, O2, T>,
    observables?: () => O1,
    derivedObservables?: (observables: ScopedObservables<O1>) => O2,
    cache?: boolean
};

export const component = <
    O1 extends Observables<{}>,
    O2 extends Observables<{}>,
    T extends Node
>({
    render,
    observables = (() => ({} as O1)),
    derivedObservables = ((_: ScopedObservables<O1>) => ({} as O2)),
    cache = true
}: Params<O1, O2, T>): ReactiveNode<Comment> => new Component<O1, O2, T>(
    render,
    observables,
    derivedObservables,
    cache
).toReactiveNode();

class Component<O1 extends Observables<{}>, O2 extends Observables<{}>, T extends Node> {
    private node: ReactiveNode<T> | undefined;
    private observables: ScopedObservables<O1> & ScopedObservables<O2> | undefined;

    constructor(
        private render: RenderFn<O1, O2, T>,
        private observableBuilder: () => O1,
        private derivedObservableBuilder: (o: ScopedObservables<O1>) => O2,
        private cache: boolean
    ) { }

    toReactiveNode() {
        return toReactiveNode(document.createComment('Component'), [{
            mount: (parentNode: Node) => {
                if (this.node === undefined || !this.cache)
                    this.node = this.render(this.getOrBuildObservables());
                this.node.mount(parentNode);
            },
            activate: () => this.node?.activate(),
            deactivate: () => {
                this.node?.deactivate();
                if (this.observables === undefined) return;
                for (const key in this.observables)
                    if (this.observables.hasOwnProperty(key))
                        this.observables[key as keyof O1 & O2].unsubscribeAll();
            },
            unmount: () => {
                this.node?.unmount();
                if (this.cache) return;
                this.node = undefined;
                this.observables = undefined;
            }
        }]);
    }

    private getOrBuildObservables() {
        if (this.observables !== undefined && this.cache)
            return this.observables;

        const coreObservables = this.toScoped<O1>(this.observableBuilder());
        const derivedObservables =
            this.toScoped<O2>(this.derivedObservableBuilder(coreObservables));

        this.observables = Object.assign(coreObservables, derivedObservables);

        return this.observables;
    }

    private toScoped<O extends Observables<{}>>(observables: O): ScopedObservables<O> {
        const scopedObservables: Partial<ScopedObservables<O>> = {};

        for (const key in observables) {
            if (!observables.hasOwnProperty(key)) continue;

            const k = key as keyof O;
            const v = observables[k] as any;
            scopedObservables[k] = scopedObservable(v) as any;
        }

        return scopedObservables as ScopedObservables<O>;
    }
}
