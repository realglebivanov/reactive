import { describe, expect, test } from "bun:test";
import { observable, mapObservable } from "../../../src/observables";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("MapObservable", () => {
    test("computes the initial mapped value", async () => {
        const a$ = observable(3);
        const b$ = observable(4);
        const sum$ = mapObservable((a, b) => a + b, a$, b$);
        const seen: number[] = [];
        sum$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();
        expect(seen).toEqual([7]);
    });

    test("collapses mapFn to one call when multiple inputs change in one tick", async () => {
        let calls = 0;
        const a$ = observable(1);
        const b$ = observable(10);
        const sum$ = mapObservable((a, b) => {
            calls++;
            return a + b;
        }, a$, b$);
        const seen: number[] = [];
        sum$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();

        calls = 0;
        seen.length = 0;
        a$.update(() => 2);
        b$.update(() => 20);
        await flush();

        expect(calls).toBe(1);
        expect(seen).toEqual([22]);
    });

    test("independent same-depth inputs both propagate", async () => {
        const a$ = observable("a");
        const b$ = observable("b");
        const joined$ = mapObservable((a, b) => `${a}${b}`, a$, b$);
        const seen: string[] = [];
        joined$.subscribeInit(Symbol(), (v) => seen.push(v));
        await flush();
        seen.length = 0;
        a$.update(() => "x");
        await flush();
        b$.update(() => "y");
        await flush();
        expect(seen).toEqual(["xb", "xy"]);
    });
});
