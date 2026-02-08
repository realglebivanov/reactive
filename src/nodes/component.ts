import {
    scopedObservable,
    ScopedObservable,
    type Observable
} from "../observables";
import { toReactiveNode, type ReactiveNode } from "../reactive/extensions";

type Observables = Record<string, Observable<any>>;
type ScopedObservables<T extends Observables> = {
    [K in keyof T]: ScopedObservable<T[K]>
};

type RenderFn<O extends Observables, T extends Node, P> =
    (this: Context<T, P>, observables: ScopedObservables<O>) => ReactiveNode<T>;

type UserOpts<O1 extends Observables, O2 extends Observables, T extends Node, P> =
    Partial<Opts<O1, O2, T, P>> & { render: RenderFn<O1 & O2, T, P> };

type Opts<O1 extends Observables, O2 extends Observables, T extends Node, P> = {
    render: RenderFn<O1 & O2, T, P>,
    observables: () => O1,
    derivedObservables: (observables: O1) => O2,
    cache: boolean,
    props: P
};

const defaultOpts = {
    observables: () => ({}),
    derivedObservables: () => ({}),
    cache: false,
    props: {}
};

export const component = <
    O1 extends Observables,
    O2 extends Observables,
    T extends Node,
    P
>(opts: UserOpts<O1, O2, T, P>): ReactiveNode<Comment> => new Component<O1, O2, T, P>(
    Object.assign({}, defaultOpts, opts)
).toReactiveNode();

class Context<T extends Node, P> {
    node: ReactiveNode<T> | undefined;
    constructor(public parent: Node, public props: P) { }
}

class Component<O1 extends Observables, O2 extends Observables, T extends Node, P> {
    private node: ReactiveNode<T> | undefined;
    private observables: ScopedObservables<O1 & O2> | undefined;
    private context: Context<T, P> | undefined;

    constructor(private opts: Opts<O1, O2, T, P>) { }

    toReactiveNode() {
        return toReactiveNode(document.createComment('Component'), [{
            mount: (parentNode: Node) => {
                if (this.node === undefined || !this.opts.cache)
                    this.setupNode(parentNode);
                this.node?.mount(parentNode);
            },
            activate: () => this.node?.activate(),
            deactivate: () => {
                this.node?.deactivate();
                if (this.observables === undefined) return;
                for (const key in this.observables)
                    this.observables[key]?.unsubscribeAll();
            },
            unmount: () => {
                this.node?.unmount();
                if (!this.opts.cache) this.cleanUp();
            }
        }]);
    }

    private setupNode(parentNode: Node) {
        this.observables = this.buildObservables();
        this.context = new Context(parentNode, this.opts.props);
        this.node = this.opts.render.call(this.context, this.observables);
        this.context.node = this.node;
    }

    private cleanUp() {
        if (this.context !== undefined) this.context.node = undefined;
        this.node = undefined;
        this.observables = undefined;
    }

    private buildObservables() {
        const coreObservables = this.opts.observables();
        const derivedObservables = this.opts.derivedObservables(coreObservables);
        const observables =
            Object.assign({}, coreObservables, derivedObservables);
        return this.toScoped<O1 & O2>(observables);
    }

    private toScoped<O extends Observables>(observables: O): ScopedObservables<O> {
        const scopedObservables: Partial<ScopedObservables<O>> = {};

        for (const key in observables) {
            const k: keyof O = key;
            scopedObservables[k] = scopedObservable(observables[k]);
        }

        return scopedObservables as ScopedObservables<O>;
    }
}
