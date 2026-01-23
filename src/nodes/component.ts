import { buildSwitch, type DomObject, type Observable } from "..";

type Observables<T> = { [K in keyof T]: Observable<T[K]> };

type Params<O1 extends Observables<{}>, O2 extends Observables<{}>> = {
    render: (observables: O1 & O2) => DomObject,
    observables: () => O1,
    derivedObservables: () => O2,
    cache: boolean
};

export const component = <
    O1 extends Observables<{}>,
    O2 extends Observables<{}>
>({
    render,
    observables = (() => ({} as O1)),
    derivedObservables = (() => ({} as O2)),
    cache = true
}: Params<O1, O2>): DomObject => new Component<O1, O2>(
    render,
    observables,
    derivedObservables,
    cache
).toNode();

class Component<O1 extends Observables<{}>, O2 extends Observables<{}>> {
    private node: DomObject | undefined;
    private observables: O1 & O2 | undefined;

    constructor(
        private render: (observables: O1 & O2) => DomObject,
        private observableBuilder: () => O1,
        private derivedObservableBuilder: (observables: O1) => O2,
        private cache: boolean
    ) { }

    toNode() {
        const commentNode = document.createComment('Component');

        return Object.assign(commentNode, buildSwitch({
            activate: () => this.activate(commentNode),
            deactivate: () => this.deactivate(commentNode)
        }));
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

        return Object.assign(
            Object.assign({}, coreObservables),
            extraObservables);
    }

    private cleanUp() {
        if (this.cache) return;
        this.node = undefined;
        this.observables = undefined;
    }
}
