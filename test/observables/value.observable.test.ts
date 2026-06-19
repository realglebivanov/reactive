import { describe, expect, test } from "bun:test";
import { observable } from "../../src/observables";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("ValueObservable", () => {
    test("subscribeInit delivers the current value", async () => {
        const a$ = observable(7);
        const seen: number[] = [];
        a$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();
        expect(seen).toEqual([7]);
    });

    test("notifies subscribers on update", async () => {
        const a$ = observable(1);
        const seen: number[] = [];
        a$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();
        a$.update((x) => x + 1);
        await flush();
        expect(seen).toEqual([1, 2]);
    });

    test("coalesces multiple updates in one tick into one notification", async () => {
        const a$ = observable(0);
        const seen: number[] = [];
        a$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();
        seen.length = 0;
        a$.update(() => 1);
        a$.update(() => 2);
        a$.update(() => 3);
        await flush();
        expect(seen).toEqual([3]);
    });

    test("unsubscribe stops further notifications", async () => {
        const a$ = observable(0);
        const seen: number[] = [];
        const id = Symbol();
        a$.subscribeInit(id, (v) => seen.push(v));
        await flush();
        a$.update(() => 1);
        await flush();
        a$.unsubscribe(id);
        a$.update(() => 2);
        await flush();
        expect(seen).toEqual([0, 1]);
    });
});
