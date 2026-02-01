import { dedupObservable, type Observable } from "../observables";
import { reactiveTextNode, toReactiveNode, type ReactiveNode } from "./reactive";

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
        const anchor = document.createComment('Cond');
        const updateFn = (value: boolean) => this.updateNode(anchor, value);

        return toReactiveNode(anchor, [{
            mount: (parentNode: Node) => parentNode.appendChild(anchor),
            activate: () => this.if$.subscribeInit(this.id, updateFn),
            deactivate: () => {
                this.if$.unsubscribe(this.id);
                this.currentNode?.deactivate();
            },
            unmount: () => {
                this.currentNode?.unmount();
                this.currentNode = undefined;
                anchor.remove();
            }
        }]);
    }

    private updateNode(anchor: Node, value: boolean) {
        const newNode = value ?
            this.buildNode<A>(this.then) :
            this.buildNode<B>(this.otherwise);
        try {
            this.switchNode(anchor, newNode);
        } catch (e) {
            console.error(e);
        }
    }

    private buildNode<T extends Node>(node: string | ReactiveNodeBuilder<T>) {
        if (typeof (node) === 'function')
            return node();
        if (typeof (node) === 'string')
            return reactiveTextNode(node);

        throw new Error('Then/otherwise should be either string or function');
    }

    private switchNode(anchor: Node, newNode: CurrentNode<A, B>) {
        this.currentNode?.deactivate();
        this.currentNode?.unmount();
        newNode.mount(anchor.parentNode!);
        newNode.activate();
        this.currentNode = newNode;
    }
}
