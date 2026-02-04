import type { ReactiveNode } from "../reactive";

export class ReactiveItem<T, N extends ReactiveNode<Node>> {
    public generationId?: number;

    constructor(
        public anchor: Node,
        public value: T,
        public node: N
    ) { }

    mount(refItem: ReactiveItem<T, N> | null) {
        const parentNode = this.anchor.parentNode;
        const insertBefore = refItem?.node.nextSibling || null;

        if (parentNode === null) return;
        if (this.node.parentNode === null) this.node.mount(parentNode);

        parentNode.insertBefore(this.node, insertBefore);
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
