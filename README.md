# Reactive

## Quick Start

```typescript
import {
    observable,
    cond,
    template,
    iterable,
    component,
    mapObservable,
    router,
    tags,
    dedupObservable,
    tag,
    once
} from ".";

import { ReactiveArray } from ".";

const LOREM = `
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
      Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
      Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

const { a, p, h1, h2, div, span, button, ul, li, img, input } = tags;

const shoppingItems = new ReactiveArray([
    { name: "milk", price$: observable("1.99") },
    { name: "sour cream", price$: observable("2.99") },
    { name: "cheese", price$: observable("0.99") }
]);

const counter = () => component({
    cache: true,
    props: { counter: "Counter" },
    observables: () => ({
        count$: observable(0),
        hard$: observable(false),
        veryHard$: observable(true)
    }),
    derivedObservables: ({ count$, hard$ }) => ({
        imageSource$: mapObservable(
            (hard) => hard ? "KashaHard.gif" : "Kasha.png",
            dedupObservable(hard$)),
        hexCounter$: mapObservable((x) => x.toString(16), count$)
    }),
    render: function ({ count$, hard$, veryHard$, imageSource$, hexCounter$ }) {
        const onClick = () => {
            count$.update((count) => count + 1);
            hard$.update((hard) => !hard);
        };

        return div(
            h2(cond({
                if$: mapObservable(
                    (hard, veryHard) => hard && veryHard, hard$, veryHard$),
                then: "Rock hard, baby",
                otherwise: "Wood needed"
            })),
            div(span(template`${this.props.counter}: ${hexCounter$}`)),
            div(img("Kasha.png").att$("src", imageSource$).clk(onClick))
        );
    }
});

const shoppingForm = () => component({
    observables: () => ({
        name$: observable(''),
        price$: observable(''),
    }),
    derivedObservables: ({ name$, price$ }) => ({
        formInvalid$:
            mapObservable((name, price) => !!!name || !!!price, name$, price$)
    }),
    render: ({ name$, price$, formInvalid$ }) => div(
        cond({
            if$: formInvalid$,
            otherwise: () => div(tag('h4', template`Pending item: ${name$} : ${price$}`))
        }),
        div(span('Name: '), input('text').att('id', 'itemName').model$(name$)),
        div(span('Price: '), input('text').att('id', 'itemPrice').model$(price$)),
        button(span('Add')).prop$('disabled', formInvalid$).clk(() => {
            once((name, price) => {
                shoppingItems.push({ name, price$: observable(price) });
                name$.update((_) => "");
                price$.update((_) => "");
            }, name$, price$);
        })
    )
});

const shoppingList = () => component({
    observables: () => ({ shoppingItems$: shoppingItems.observable$ }),
    render: ({ shoppingItems$ }) => div(
        h2("Shopping items"),
        ul(
            iterable({
                it$: shoppingItems$,
                buildFn: (_, item) => li(span(template`${item.name} - ${item.price$}`)),
                keyFn: (_, item) => item.name,
            })
        )
    )
});

const exampleRouter = router({
    "/": div(
        h1("Reactive"),
        div(a("Foo").att("href", "#/foo")),
        div(a("Bar").att("href", "#/bar")),
        counter(),
        shoppingList(),
        shoppingForm()
    ),
    "/foo": component({
        observables: () => ({ count$: observable(0) }),
        derivedObservables: ({ count$ }) => ({
            paragraphStyle$: mapObservable(
                (count) => `color: ${numberToHexColor(count * 999999)}`, count$)
        }),
        render: ({ count$, paragraphStyle$ }) => div(
            h1("Foo"),
            p(LOREM).att$("style", paragraphStyle$),
            button("Change color").clk(() => count$.update((x) => x + 1)),
            div(a("Home").att("href", "#")),
        )
    }),
    "/bar": div(
        h1("Bar"),
        p(LOREM),
        div(a("Home").att("href", "#"))
    )
}, { notFoundRoute: "/" });

function numberToHexColor(number: number) {
    let hex = (number % 0xffffff).toString(16);
    while (hex.length < 6) hex = "0" + hex;
    return "#" + hex;
}

exampleRouter.mount(document.getElementById('entry')!);
exampleRouter.activate();
```
## Restrictions & Edge Cases

### 1. Component Observables
-  Subscriptions to observables declared outside of a component **will not be automatically cleaned up**. Users must manage them manually to avoid memory leaks.

### 2. ReactiveArray
- `ReactiveArray` is **primitive** and **not a full replacement for native arrays**.  
- Only the following events are supported:
  - `{ type: "replace", items: T[] }` — replaces the entire array
  - `{ type: "append", items: T[] }` — appends items at the end
  - `{ type: "remove", items: Map<number, T> }` — removes items at given indices
  - `{ type: "replaceKeys", items: Map<number, T> }` — replaces items at specific indices  

### 3. Iterable
- Iterable expects a **reactive source** (`Observable<Event<T>>`) or a normal collection (`Array`/`Map`), which is automatically wrapped in a replace event.  

### 5. Performance Considerations
- For very large arrays or frequent updates, consider using **your own ReactiveArray-like implementation** that emit fine-grained events (`append`, `replaceKeys`, `remove`) instead of full replacements.  
