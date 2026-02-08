import { buildLifecycleHooks, type Lifecycle } from './lifecycle';
import type { Observable } from '../observables';

export type ReactiveNode<T extends Node> = Lifecycle & T & ReactiveNodeSetters<T>;

export interface ReactiveNodeSetters<T extends Node> {
    listen: <R extends ReactiveNode<T>>(
        this: R,
        type: string,
        cb: EventListenerOrEventListenerObject
    ) => R;
    clk: <R extends ReactiveNode<T>>(
        this: R,
        cb: EventListenerOrEventListenerObject
    ) => R;
}

export type TagReactiveNode<K extends keyof HTMLElementTagNameMap> =
    ReactiveNode<HTMLElementTagNameMap[K]> & TagReactiveNodeSetters<K>;

export interface TagReactiveNodeSetters<K extends keyof HTMLElementTagNameMap> {
    att: (name: string, value: string) => TagReactiveNode<K>;
    class$: (value: Observable<string>) => TagReactiveNode<K>;
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

const buildTagNodeSetters = <K extends keyof HTMLElementTagNameMap>(
    handlers: Lifecycle[]
) => ({
    att: function (this: TagReactiveNode<K>, name: string, value: string) {
        this.setAttribute(name, value);
        return this;
    },
    class$: function (this: TagReactiveNode<K>, value$: Observable<string>) {
        return this.att$('class', value$);
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
        return this.listen('click', callback);
    },
    listen: function <R extends ReactiveNode<T>>(
        this: R,
        type: string,
        callback: EventListenerOrEventListenerObject
    ) {
        handlers.push({
            mount: (_: Node) => undefined,
            activate: () => this.addEventListener(type, callback),
            deactivate: () => this.removeEventListener(type, callback),
            unmount: () => undefined
        });

        return this;
    }
});
