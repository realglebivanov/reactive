import {
    observable,
    cond,
    template,
    iterable,
    component,
    mapObservable,
    router,
    tags,
    dedupObservable
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
        hexCounter$: mapObservable((x) => x.toString(2), count$)
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
    render: () => div(
        div(span('Name: '), input('text').att('id', 'itemName').class$(observable(''))),
        div(span('Price: '), input('text').att('id', 'itemPrice')),
        button(span('Add')).clk(() => {
            const itemName = document.getElementById('itemName') as HTMLInputElement;
            const itemPrice = document.getElementById('itemPrice') as HTMLInputElement;

            if (itemName.value == "" || itemPrice.value == "") return;

            shoppingItems.push({
                name: itemName.value,
                price$: observable(itemPrice.value)
            });

            itemName.value = "";
            itemPrice.value = "";
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
        h1("Grecha.js"),
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
