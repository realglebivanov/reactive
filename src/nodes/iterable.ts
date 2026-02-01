import type { Observable } from "../observables";
import { toReactiveNode, type ReactiveNode } from "./reactive";

type Key = string | number | boolean | symbol;
type BuildFn<N extends Node, T> = ((key: Key, value: T) => ReactiveNode<N>);
type KeyFn<T> = ((key: Key, value: T) => Key);
type Source<T> = Array<T> | Map<Key, T>;

export const iterable = <T, N extends ReactiveNode<Node>>(
    { it$, buildFn, keyFn }: {
        it$: Observable<Source<T>>,
        buildFn: BuildFn<N, T>,
        keyFn: KeyFn<T>
    }
) => new Iterable<T, N>(
    it$,
    buildFn,
    keyFn
).toReactiveNode();

class Iterable<T, N extends ReactiveNode<Node>> {
    private readonly id = Symbol('Iterable');
    private currentItems = new Map<Key, ReactiveItem<T, N>>();
    private nodeGeneration = 0;

    constructor(
        private it$: Observable<Source<T>>,
        private buildFn: BuildFn<N, T>,
        private keyFn: KeyFn<T>
    ) { }

    toReactiveNode() {
        const anchor = document.createComment('Iterable');
        const updateFn =
            (newValue: Source<T>) => this.updateNodes(anchor, newValue);

        return toReactiveNode(anchor, [{
            mount: (parentNode: Node) => parentNode.appendChild(anchor),
            activate: () => this.it$.subscribeInit(this.id, updateFn),
            deactivate: () => {
                this.it$.unsubscribe(this.id);
                for (const item of this.currentItems.values())
                    item.deactivate();
            },
            unmount: () => {
                for (const item of this.currentItems.values())
                    item.unmount();
                anchor.remove();
                this.currentItems.clear();
            }
        }]);
    }

    private updateNodes(anchor: Node, newValue: Source<T>) {
        this.nodeGeneration++;
        let refItem = null;

        for (const [k, value] of newValue.entries()) {
            const key = this.keyFn(k, value);
            const item = this.rebuildOrCreate(anchor, key, value);

            item.mount(refItem);
            item.activate(this.nodeGeneration);

            refItem = item;
        }

        this.removeStaleNodes();
    }

    private rebuildOrCreate(anchor: Node, key: Key, value: T) {
        const item = this.currentItems.get(key);
        if (item === undefined) return this.createItem(anchor, key, value);
        if (item.value === value) return item;

        item.deactivate();
        item.unmount();

        return this.createItem(anchor, key, value);
    }

    private createItem(anchor: Node, key: Key, value: T) {
        const newNode = this.buildFn(key, value);
        const item = new ReactiveItem(anchor, value, newNode);
        this.currentItems.set(key, item);
        return item;
    }

    private removeStaleNodes() {
        for (const [key, node] of this.currentItems.entries()) {
            if (node.generationId === this.nodeGeneration) continue;
            node.deactivate();
            node.unmount();
            this.currentItems.delete(key);
        }
    }
}

class ReactiveItem<T, N extends ReactiveNode<Node>> {
    public generationId?: number;

    constructor(
        private anchor: Node,
        public value: T,
        public node: N
    ) { }

    mount(refItem: ReactiveItem<T, N> | null) {
        const parentNode = this.anchor.parentNode;

        if (parentNode === null) return;
        if (this.node.parentNode === null) this.node.mount(parentNode);

        if (refItem === null)
            parentNode.insertBefore(this.node, null);
        else
            parentNode.insertBefore(this.node, refItem.node.nextSibling);
    }

    activate(generationId: number): void {
        if (this.generationId === undefined)
            this.node.activate();
        this.generationId = generationId;
    }

    deactivate(): void {
        this.node.deactivate();
    }

    unmount(): void {
        this.node.unmount();
    }
}
