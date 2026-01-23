import { buildSwitch, ensureSwitch } from "..";
import type { Observable } from "../observables";
import type { DomObject } from "../tag";

type Key = string | number | boolean | symbol;
type BuildFn<T> = ((key: Key, value: T) => ItDomObject<T>);
type KeyFn<T> = ((key: Key, value: T) => Key);

type ItDomObject<T> = DomObject & {
    [generationId]: number | undefined,
    [valueId]: T | undefined
};
type Source<T> = Array<T> | Map<Key, T>;

const generationId = Symbol('genid');
const valueId = Symbol('valid');

export const iterable = <T>(
    { it$, buildFn, keyFn }: {
        it$: Observable<Source<T>>,
        buildFn: BuildFn<T>,
        keyFn: KeyFn<T>
    }
) => new Iterable<T>(
    it$,
    buildFn,
    keyFn
).toNode();

class Iterable<T> {
    private readonly id = Symbol('Iterable');
    private currentNodes = new Map<Key, ItDomObject<T>>();
    private nodeGeneration = 0;

    constructor(
        private it$: Observable<Source<T>>,
        private buildFn: BuildFn<T>,
        private keyFn: KeyFn<T>
    ) { }

    toNode() {
        const commentNode = document.createComment('Iterable');

        const updateNodeFn = (newValue: Source<T>) => {
            if (commentNode.parentNode === null)
                return console.warn("Node wasn't mounted before update");

            this.updateNodes(commentNode.parentNode, newValue);
        };

        return Object.assign(commentNode, buildSwitch({
            activate: () => this.it$.subscribeInit(this.id, updateNodeFn),
            deactivate: () => {
                if (commentNode.parentNode === null)
                    return console.warn("Node wasn't mounted before deactivation");

                this.deactivateNodes(commentNode.parentNode);
            }
        }));
    }

    private deactivateNodes(parentNode: Node) {
        this.it$.unsubscribe(this.id);
        for (const node of this.currentNodes.values()) {
            node.deactivate();
            parentNode.removeChild(node);
        }
        this.currentNodes.clear();
    }

    private updateNodes(parentNode: Node, newValue: Source<T>) {
        this.nodeGeneration++;
        let refNode = null;

        for (const [k, value] of newValue.entries()) {
            const key = this.keyFn(k, value);
            const node = this.rebuildOrCreateNode(parentNode, key, value);

            this.adjustNode(node, parentNode, refNode);

            node[generationId] = this.nodeGeneration;
            refNode = node.nextSibling;
        }

        this.removeStaleNodes(parentNode);
    }

    private rebuildOrCreateNode(parentNode: Node, key: Key, value: T) {
        const node = this.currentNodes.get(key);
        if (node === undefined) return this.createNode(key, value);
        if (node[valueId] === value) return node;

        node.deactivate();
        parentNode.removeChild(node);

        return this.createNode(key, value);
    }

    private createNode(key: Key, value: T) {
        const newNode = ensureSwitch(this.buildFn(key, value));
        this.currentNodes.set(key, newNode);
        newNode[valueId] = value;

        return newNode;
    }

    private adjustNode(node: ItDomObject<T>, parentNode: Node, refNode: Node | null) {
        if (node.nextSibling == null || !node.nextSibling.isSameNode(refNode)) {
            parentNode.insertBefore(node, refNode);
            if (node[generationId] === undefined) node.activate();
        }

        return node;
    };

    private removeStaleNodes(parentNode: Node) {
        for (const [key, node] of this.currentNodes.entries()) {
            if (node[generationId] === this.nodeGeneration) continue;
            node.deactivate();
            parentNode.removeChild(node);
            this.currentNodes.delete(key);
        }
    }
}
