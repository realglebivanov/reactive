import { buildLifecycleHooks, type Lifecycle } from '../lifecycle';
import type { Observable } from '../observables';

export type ReactiveNode<T extends Node> = Lifecycle & T & ReactiveNodeSetters<T>;

export interface ReactiveNodeSetters<T extends Node> {
    clk: <R extends ReactiveNode<T>>(cb: EventListenerOrEventListenerObject) => R;
}

export type TagReactiveNode<K extends keyof HTMLElementTagNameMap> =
    ReactiveNode<HTMLElementTagNameMap[K]> &
    TagReactiveNodeSetters<K>;

export interface TagReactiveNodeSetters<K extends keyof HTMLElementTagNameMap> {
    att: (name: string, value: string) => TagReactiveNode<K>;
    att$: (name: string, value: Observable<string>) => TagReactiveNode<K>;
}

export const toTagReactiveNode = <K extends keyof HTMLElementTagNameMap>(
    node: HTMLElementTagNameMap[K],
    handlers: Lifecycle[]
): TagReactiveNode<K> => {
    const internalHandlers = [...handlers];
    const tagNodeSetters = buildTagNodeSetters<K>(internalHandlers);
    const nodeSetters = buildNodeSetters(internalHandlers);
    const hooks = buildLifecycleHooks(internalHandlers);

    return Object.assign(node, nodeSetters, tagNodeSetters, hooks);
};

export const toReactiveNode = <T extends Node>(
    node: T,
    handlers: Lifecycle[]
): ReactiveNode<T> => {
    const internalHandlers = [...handlers];
    const nodeSetters = buildNodeSetters(internalHandlers);
    const hooks = buildLifecycleHooks(internalHandlers);

    return Object.assign(node, nodeSetters, hooks);
};

export const reactiveTextNode = (text: string) => {
    const textNode = document.createTextNode(text);
    const hooks = [{
        mount: (parentNode: Node) => parentNode.appendChild(textNode),
        activate: () => undefined,
        deactivate: () => undefined,
        unmount: () => textNode.remove()
    }];

    return toReactiveNode(textNode, hooks);
}

const buildTagNodeSetters = <K extends keyof HTMLElementTagNameMap>(
    handlers: Lifecycle[]
) => ({
    att: function (this: TagReactiveNode<K>, name: string, value: string) {
        this.setAttribute(name, value);
        return this;
    },
    att$: function (
        this: TagReactiveNode<K>,
        name: string,
        value$: Observable<string>
    ) {
        const subscriberId = Symbol(`Attribute: ${name}`)

        handlers.push({
            mount: (_: Node) => undefined,
            activate: () => value$.subscribeInit(
                subscriberId,
                (value: string) => this.setAttribute(name, value)),
            deactivate: () => value$.unsubscribe(subscriberId),
            unmount: () => undefined
        });

        return this;
    }
});

const buildNodeSetters = <T extends Node>(
    handlers: Lifecycle[]
) => ({
    clk: function <R extends ReactiveNode<T>>(
        this: R,
        callback: EventListenerOrEventListenerObject
    ) {
        handlers.push({
            mount: (_: Node) => undefined,
            activate: () => this.addEventListener('click', callback),
            deactivate: () => this.removeEventListener('click', callback),
            unmount: () => undefined
        });

        return this;
    }
});
