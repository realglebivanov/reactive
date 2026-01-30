import { dedupObservable, type Observable } from "../observables";
import { toReactiveNode, type ReactiveNode } from "./reactive";

type ReactiveNodeBuilder<T extends Node> = (() => ReactiveNode<T>);

type Params<A extends Node, B extends Node> = {
    if$: Observable<boolean>, 
    then: ReactiveNodeBuilder<A> | string, 
    otherwise: ReactiveNodeBuilder<B> | string
};

type CurrentNode<A extends Node, B extends Node> =
    ReactiveNode<A> | ReactiveNode<B> | ReactiveNode<Text>;

export const cond = <A extends Node, B extends Node>(
    { if$, then, otherwise }: Params<A, B>
): ReactiveNode<Comment> => new Cond<A, B>(
    dedupObservable(if$),
    then,
    otherwise
).toReactiveNode();

class Cond<A extends Node, B extends Node> {
    private id = Symbol('Cond');
    private currentNode: CurrentNode<A, B> | undefined;

    constructor(
        private if$: Observable<boolean>,
        private then: ReactiveNodeBuilder<A> | string,
        private otherwise: ReactiveNodeBuilder<B> | string
    ) { }

    toReactiveNode() {
        const commentNode = document.createComment('Cond');

        const updateNodeFn = (value: boolean) => {
            if (commentNode.parentNode === null)
                return console.warn("Node wasn't mounted before activation");

            this.updateNode(commentNode.parentNode, value);
        };

        return toReactiveNode(commentNode, [{
            activate: () => this.if$.subscribeInit(this.id, updateNodeFn),
            deactivate: () => this.deactivate(commentNode.parentNode)
        }]);
    }

    private buildNode<T extends Node>(node: string | ReactiveNodeBuilder<T>) {
        if (typeof (node) === 'function') 
            return node();
        if (typeof (node) === 'string') 
            return toReactiveNode(document.createTextNode(node), []);

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
        if (this.currentNode === undefined) return;

        const currentNode = this.currentNode;
        currentNode.deactivate();
        this.currentNode = undefined;

        if (parentNode === null)
            return console.warn("Node wasn't mounted before deactivation");

        parentNode.removeChild(currentNode);
    }

    private updateNode(parentNode: Node, value: boolean) {
        try {
            const newNode = value ? 
                this.buildNode<A>(this.then) :  
                this.buildNode<B>(this.otherwise);
            this.switchNode(parentNode, newNode);
        } catch (e) {
            console.error(e);
        }
    };

    private switchNode(parentNode: Node, node: CurrentNode<A, B>) {
        this.currentNode?.deactivate();

        if (this.currentNode === undefined)
            parentNode.appendChild(node);
        else
            parentNode.replaceChild(node, this.currentNode);

        node.activate();
        this.currentNode = node;
    };
}
