import { describe, expect, test } from "bun:test";
import { observable, mapObservable, dedupObservable } from "../../src/observables";

// Updates propagate over microtasks (init + update schedulers, cascading across
// depths). A macrotask tick guarantees every pending microtask has drained.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("scheduler depth ordering", () => {
    // Diamond with unequal path lengths: e depends on `a` directly (depth 1 from a)
    // AND on `c`, which is itself derived from `a` (depth 2 from a). Under a plain
    // FIFO scheduler, `e` could run before `c` updated, emit a stale value, and
    // then be blocked from re-running. Depth ordering must prevent that.
    test("unequal-length diamond resolves without a stale emission", async () => {
        const a$ = observable(1);
        const c$ = mapObservable((a) => a * 10, a$);
        const e$ = mapObservable((a, c) => `a=${a},c=${c}`, a$, c$);
        const seen: string[] = [];

        e$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();
        seen.length = 0;

        a$.update(() => 2); // expect c -> 20, e -> "a=2,c=20"
        await flush();

        // exactly one notification, and it is the consistent final value
        expect(seen).toEqual(["a=2,c=20"]);
    });

    test("deep unequal chain converges to the correct value", async () => {
        const a$ = observable(1);
        const b$ = mapObservable((a) => a + 1, a$);
        const c$ = mapObservable((b) => b * 100, b$);
        const e$ = mapObservable((a, c) => a + c, a$, c$);
        const seen: number[] = [];

        e$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();
        seen.length = 0;

        a$.update(() => 5); // b=6, c=600, e=5+600=605
        await flush();

        expect(seen).toEqual([605]); // no stale intermediate
    });

    test("dedup node within a diamond path stays consistent", async () => {
        const a$ = observable(0);
        const parity$ = dedupObservable(mapObservable((a) => a % 2, a$));
        const e$ = mapObservable((a, p) => `${a}:${p}`, a$, parity$);
        const seen: string[] = [];
        e$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();
        seen.length = 0;

        a$.update(() => 4); // parity stays 0 (4 % 2), e -> "4:0"
        await flush();

        expect(seen).toEqual(["4:0"]);
    });
});
