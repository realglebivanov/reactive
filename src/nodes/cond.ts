import { buildSwitch, ensureSwitch, type Lifecycle } from "..";
import { dedupObservable, type Observable } from "../observables";
import type { DomObject } from "../tag";

type NodeFrom = (() => DomObject & Partial<Lifecycle>) | string;
type Params = { if$: Observable<boolean>, then: NodeFrom, otherwise: NodeFrom }

export const cond = ({ if$, then, otherwise }: Params): DomObject => new Cond(
    dedupObservable(if$),
    then,
    otherwise
).toNode();

class Cond {
    private id = Symbol('Cond');
    private currentNode: DomObject | undefined;

    constructor(
        private if$: Observable<boolean>,
        private then: NodeFrom,
        private otherwise: NodeFrom
    ) { }

    toNode() {
        const commentNode = document.createComment('Cond');

        const updateNodeFn = (value: boolean) => {
            if (commentNode.parentNode === null)
                return console.warn("Node wasn't mounted before activation");

            this.updateNode(commentNode.parentNode, value);
        };

        return Object.assign(commentNode, buildSwitch({
            activate: () => this.if$.subscribe(this.id, updateNodeFn),
            deactivate: () => this.deactivate(commentNode.parentNode)
        }));
    }

    private buildNode(node: NodeFrom): DomObject {
        if (typeof (node) === 'function') return ensureSwitch(node());
        if (typeof (node) === 'string')
            return ensureSwitch(document.createTextNode(node));

        throw new Error('Then/otherwise should be either strings or functions');
    };

    private deactivate(parentNode: Node | null) {
        this.if$.unsubscribe(this.id);

        try {
            this.detachCurrentNode(parentNode);
        } catch (e) {
            console.error(e);
        }
    };

    private detachCurrentNode(parentNode: Node | null) {
        const currentNode = this.currentNode;
        
        if (currentNode === undefined) return;

        currentNode.deactivate();
        this.currentNode = undefined;

        if (parentNode === null)
            return console.warn("Node wasn't mounted before deactivation");

        parentNode.removeChild(currentNode);
    }

    private updateNode(parentNode: Node, value: boolean) {
        try {
            const newNode = value ?
                this.buildNode(this.then) : this.buildNode(this.otherwise);
            this.switchNode(parentNode, newNode);
        } catch (e) {
            console.error(e);
        }
    };

    private switchNode(parentNode: Node, node: DomObject) {
        this.currentNode?.deactivate();
        node.activate();

        if (this.currentNode === undefined)
            parentNode.appendChild(node);
        else
            parentNode.replaceChild(node, this.currentNode);

        this.currentNode = node;
    };
}
