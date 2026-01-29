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
    (observables: ScopedObservables<O1 & O2>) => ReactiveNode<T>;

type Params<O1 extends Observables<{}>, O2 extends Observables<{}>, T extends Node> = {
    render: RenderFn<O1, O2, T>,
    observables?: () => O1,
    derivedObservables?: (observables: O1) => O2,
    cache?: boolean
};

export const component = <
    O1 extends Observables<{}>,
    O2 extends Observables<{}>,
    T extends Node
>({
    render,
    observables = (() => ({} as O1)),
    derivedObservables = ((_: O1) => ({} as O2)),
    cache = true
}: Params<O1, O2, T>): ReactiveNode<Comment> => new Component<O1, O2, T>(
    render,
    observables,
    derivedObservables,
    cache
).toReactiveNode();

class Component<O1 extends Observables<{}>, O2 extends Observables<{}>, T extends Node> {
    private node: ReactiveNode<T> | undefined;
    private observables: ScopedObservables<O1 & O2> | undefined;

    constructor(
        private render: RenderFn<O1, O2, T>,
        private observableBuilder: () => O1,
        private derivedObservableBuilder: (observables: O1) => O2,
        private cache: boolean
    ) { }

    toReactiveNode() {
        const commentNode: Comment = document.createComment('Component');

        return toReactiveNode(commentNode, [{
            activate: () => this.activate(commentNode),
            deactivate: () => this.deactivate(commentNode)
        }]);
    }

    private activate(commentNode: Comment) {
        if (commentNode.parentNode === null)
            return console.warn("Node wasn't mounted before activation");

        if (this.node === undefined || !this.cache)
            this.node = this.render(this.getOrBuildObservables());

        commentNode.parentNode.appendChild(this.node);
        this.node.activate();
    }

    private deactivate(commentNode: Comment) {
        if (commentNode.parentNode === null)
            return console.warn("Node wasn't mounted before deactivation");

        if (this.node === undefined)
            return console.warn("Node wasn't created before deactivation");

        this.node.deactivate();
        commentNode.parentNode.removeChild(this.node);
        this.cleanUp();
    }

    private getOrBuildObservables() {
        if (this.observables === undefined || !this.cache)
            return this.observables = this.buildObservables();

        return this.observables;
    }

    private buildObservables() {
        const coreObservables = this.observableBuilder();
        const extraObservables = this.derivedObservableBuilder(coreObservables);
        const proxyObservables: Partial<ScopedObservables<O1 & O2>> = {};

        for (const key in coreObservables) {
            const k = key as keyof O1;
            const v = coreObservables[k] as any;
            proxyObservables[k] = scopedObservable(v) as any;
        }

        for (const key in extraObservables) {
            const k = key as keyof O2;
            const v = extraObservables[k] as any;
            proxyObservables[k] = scopedObservable(v) as any;
        }

        return proxyObservables as ScopedObservables<O1 & O2>;
    }

    private cleanUp() {
        if (this.cache) return;
        this.node = undefined;
        if (this.observables === undefined) return;

        for (const key in this.observables)
            this.observables[key as (keyof O1 & keyof O2)].unsubscribeAll();

        this.observables = undefined;
    }
}
