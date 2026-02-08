import { mapObservable, type Observable } from "../observables";
import { toReactiveNode, type ReactiveNode } from "../reactive/extensions";
import {
    ReactiveItemCollection,
    type BuildFn,
    type Collection,
    type Key,
    type KeyFn
} from "./iterable/collection";

type Source<T> = Collection<T> | Event<T>;

export type Event<T> =
    { type: "replace", items: Collection<T> } |
    { type: "remove", items: Collection<T> } |
    { type: "append", items: Collection<T> } |
    { type: "replaceKeys", items: Collection<T> };

export const iterable = <K extends Key, T, N extends ReactiveNode<Node>>(
    { it$, buildFn, keyFn }: {
        it$: Observable<Source<T>>,
        buildFn: BuildFn<N, T>,
        keyFn: KeyFn<K, T>
    }
): ReactiveNode<Comment> => new Iterable<K, T, N>(
    it$,
    buildFn,
    keyFn
).toReactiveNode();

class Iterable<K extends Key, T, N extends ReactiveNode<Node>> {
    private readonly id = Symbol('Iterable');
    private it$: Observable<Event<T>>;
    private items: ReactiveItemCollection<K, T, N>;

    constructor(
        it$: Observable<Source<T>>,
        buildFn: BuildFn<N, T>,
        keyFn: KeyFn<K, T>
    ) {
        this.it$ = this.toEventObservable(it$);
        this.items = new ReactiveItemCollection(keyFn, buildFn);
    }

    toReactiveNode() {
        const anchor = document.createComment('Iterable');
        const updateFn = (event: Event<T>) => {
            switch (event.type) {
                case "replace":
                    return this.items.replace(anchor, event.items);
                case "replaceKeys":
                    return this.items.replaceKeys(anchor, event.items);
                case "append":
                    return this.items.append(anchor, event.items);
                case "remove":
                    return this.items.remove(event.items);
                default:
                    return console.warn('Unsupported event type', event);    
            }
        };

        return toReactiveNode(anchor, [{
            mount: (parentNode: Node) => parentNode.appendChild(anchor),
            activate: () => this.it$.subscribeInit(this.id, updateFn),
            deactivate: () => {
                this.it$.unsubscribe(this.id);
                this.items.deactivate();
            },
            unmount: () => {
                this.items.unmount();
                anchor.remove();
            }
        }]);
    }

    private toEventObservable(it$: Observable<Source<T>>): Observable<Event<T>> {
        return mapObservable((source: Source<T>) => {
            if (source instanceof Array || source instanceof Map) {
                return { type: "replace", items: source };
            }
            return source;
        }, it$)
    }
}
