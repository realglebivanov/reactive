import type { Observable } from '../observables';

export interface Lifecycle {
    activate: () => void,
    deactivate: () => void,
}

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
    const hooks = buildHooks(internalHandlers);

    return Object.assign(node, nodeSetters, tagNodeSetters, hooks);
};

export const toReactiveNode = <T extends Node>(
    node: T,
    handlers: Lifecycle[]
): ReactiveNode<T> => {
    const internalHandlers = [...handlers];
    const nodeSetters = buildNodeSetters(internalHandlers);
    const hooks = buildHooks(internalHandlers);

    return Object.assign(node, nodeSetters, hooks);
};

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
            activate: () => value$.subscribeInit(
                subscriberId,
                (value: string) => this.setAttribute(name, value)),
            deactivate: () => value$.unsubscribe(subscriberId)
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
            activate: () => this.addEventListener('click', callback),
            deactivate: () => this.removeEventListener('click', callback)
        });
        return this;
    }
});

const buildHooks = (handlers: Lifecycle[]): Lifecycle => {
    let active = false;
    return {
        activate: () => {
            if (active) return;
            active = true;
            for (const handler of handlers) handler.activate();
        },
        deactivate: () => {
            if (!active) return;
            active = false;
            for (const handler of handlers) handler.deactivate()
        },
    };
};
