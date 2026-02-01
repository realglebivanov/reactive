export interface Lifecycle {
    mount(parentNode: Node): void,
    activate(): void,
    deactivate(): void,
    unmount(): void
}

export enum ReactiveNodeStatus {
    Active,
    Inactive,
    Mounted,
    Unmounted
};

export const buildLifecycleHooks = (handlers: Lifecycle[]): Lifecycle => {
    let status = ReactiveNodeStatus.Unmounted;

    return {
        mount: (parentNode: Node) => {
            if (status !== ReactiveNodeStatus.Unmounted)
                return console.warn(`Mounting in status ${ReactiveNodeStatus[status]}`);
            for (const handler of handlers) handler.mount(parentNode);
            status = ReactiveNodeStatus.Mounted;
        },
        activate: () => {
            if (status !== ReactiveNodeStatus.Mounted && status !== ReactiveNodeStatus.Inactive)
                return console.warn(`Activating in status ${ReactiveNodeStatus[status]}`);
            for (const handler of handlers) handler.activate();
            status = ReactiveNodeStatus.Active;
        },
        deactivate: () => {
            if (status !== ReactiveNodeStatus.Active)
                return console.warn(`Deactivating in status ${ReactiveNodeStatus[status]}`);
            for (const handler of handlers) handler.deactivate()
            status = ReactiveNodeStatus.Inactive;
        },
        unmount() {
            if (status !== ReactiveNodeStatus.Inactive)
                return console.warn(`Unmounting in status ${ReactiveNodeStatus[status]}`);
            for (const handler of handlers) handler.unmount();
            status = ReactiveNodeStatus.Unmounted;
        },
    };
};
