import type { ReactiveNode } from "../../reactive/extensions";
import { ReactiveItem } from "./item";

export type Key = string | number | boolean | symbol;
export type KeyFn<K extends Key, T> = ((key: Key, value: T) => K);
export type BuildFn<N extends Node, T> = ((key: Key, value: T) => ReactiveNode<N>);
export type Collection<T> = Array<T> | Map<Key, T>;

export class ReactiveItemCollection<K extends Key, T, N extends ReactiveNode<Node>> {
    private generationId = 0;
    private items = new Map<K, ReactiveItem<T, N>>();

    constructor(
        private keyFn: KeyFn<K, T>,
        private buildFn: BuildFn<N, T>,
    ) { }

    deactivate() {
        for (const item of this.items.values()) 
            item.deactivate();
    }

    unmount() {
        for (const item of this.items.values())
            item.unmount();
        this.items.clear();
        this.generationId = 0;
    }

    replace(anchor: Node, newItems: Collection<T>) {
        this.generationId++;
        let refItem = null;

        for (const [k, value] of newItems.entries()) {
            const key = this.keyFn(k, value);
            const item = this.getOrInsert(anchor, refItem, key, value);
            item.generationId = this.generationId;
            refItem = item;
        }

        this.removeStaleItems();
    }

    replaceKeys(anchor: Node, items: Collection<T>) {
        for (const [k, value] of items.entries()) {
            const key = this.keyFn(k, value);
            const refItem = this.items.get(key);

            if (refItem === undefined) continue;

            this.insertItem(anchor, refItem, key, value);
            refItem.deactivate();
            refItem.unmount();
        }
    }

    append(anchor: Node, newItems: Collection<T>) {
        for (const [k, value] of newItems.entries()) {
            const key = this.keyFn(k, value);
            this.insertItem(anchor, null, key, value);
        }
    }

    remove(items: Collection<T>) {
        for (const [k, value] of items.entries()) {
            const key = this.keyFn(k, value);
            const item = this.items.get(key);
            if (item === undefined) continue;
            item.deactivate();
            item.unmount();
            this.items.delete(key);
        }
    }

    private getOrInsert(anchor: Node, refItem: ReactiveItem<T, N> | null, key: K, value: T) {
        const item = this.items.get(key);

        if (item === undefined) return this.insertItem(anchor, refItem, key, value);
        if (item.value === value) return item;

        item.deactivate();
        item.unmount();

        return this.insertItem(anchor, refItem, key, value);
    }

    private insertItem(anchor: Node, refItem: ReactiveItem<T, N> | null, key: K, value: T) {
        const newNode = this.buildFn(key, value);
        const item = new ReactiveItem(anchor, value, newNode);
        
        item.mount(refItem);
        item.activate(this.generationId);
        this.items.set(key, item);

        return item;
    }

    private removeStaleItems() {
        for (const [key, item] of this.items.entries()) {
            if (item.generationId === this.generationId) continue;
            item.deactivate();
            item.unmount();
            this.items.delete(key);
        }
    }
}
