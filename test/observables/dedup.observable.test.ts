import { describe, expect, test } from "bun:test";
import { observable, dedupObservable } from "../../src/observables";

// Updates propagate over microtasks; a macrotask tick drains them all.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("DedupObservable", () => {
    test("suppresses notifications for equal values", async () => {
        const a$ = observable(1);
        const deduped$ = dedupObservable(a$);
        const seen: number[] = [];

        deduped$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();
        seen.length = 0;

        a$.update(() => 1); // equal -> suppressed
        await flush();
        a$.update(() => 2); // changed -> delivered
        await flush();

        expect(seen).toEqual([2]);
    });
});
