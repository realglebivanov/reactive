import type { Observable, Observer, Updatable, UpdateFn } from ".";
import type { TagReactiveNode } from "../reactive";

export const inputObservable = <I extends 'input' | 'textarea' | 'select'>(
    input: TagReactiveNode<I>,
    value$: Observable<string> & Updatable<string>
): InputObservable<I> => new InputObservable<I>(input, value$);


export class InputObservable<
    I extends 'input' | 'textarea' | 'select'
> implements Observable<string>, Updatable<string> {
    private aliases = new Map<symbol, symbol>();

    constructor(
        private input: TagReactiveNode<I>,
        private value$: Observable<string> & Updatable<string>
    ) { }

    subscribe(id: symbol, observer: Observer<string>): void {
        if (this.aliases.has(id)) return;
        const alias = Symbol('InputObservable');
        this.aliases.set(id, alias);
        this.value$.subscribe(alias, this.toInputObserver(observer));
    }

    subscribeInit(id: symbol, observer: Observer<string>): void {
        if (this.aliases.has(id)) return;
        const alias = Symbol('InputObservable');
        this.aliases.set(id, alias);
        this.value$.subscribeInit(alias, this.toInputObserver(observer));
    }

    unsubscribe(id: symbol): void {
        const alias = this.aliases.get(id);
        if (alias === undefined) return;
        this.value$.unsubscribe(alias);
        this.aliases.delete(id);
    }

    unsubscribeAll(): void {
        for (const alias of this.aliases.values())
            this.value$.unsubscribe(alias);
        this.aliases.clear();
    }

    update(updateFn: UpdateFn<string>): void {
        this.value$.update(updateFn);
    }

    private toInputObserver(observer: Observer<string>) {
        return (value: string) => {
            if (this.input.value !== value) observer(value);
        };
    }
}
