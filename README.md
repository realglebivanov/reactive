# Grecha.js

![KashaHard](KashaHard.gif)

Simple Front-End JavaScript Framework. Originally designed for [emoteJAM](https://github.com/tsoding/emoteJAM). The name basically means [buckwheat](https://en.wikipedia.org/wiki/Buckwheat) in russian.

## Quick Start

https://tsoding.github.io/grecha.js/example.html

```html
<!DOCTYPE html>
<html>

<head>
  <title>Grecha.js</title>
</head>

<body>
  <div id="entry"></div>
  <script src="./grecha.js"></script>
  <script>
    const shoppingItems$ = observable([
      { name: "milk", price$: observable("1.99") },
      { name: "sour cream", price$: observable("2.99") },
      { name: "cheese", price$: observable("0.99") }
    ]);

    const counter = () => component({
      observables: () => ({
        count$: observable(0),
        hard$: observable(false),
        veryHard$: observable(true)
      }),
      render: ({ count$, hard$, veryHard$ }) => {
        const click = function () {
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
          div(span(template('Counter: ?', count$))),
          div(cond({
            if$: hard$,
            then: () => img("KashaHard.gif").click(click),
            otherwise: () => img("Kasha.png").click(click)
          }))
        );
      }
    });

    const shoppingForm = (item) => component({
      render: () => div(
        div(span('Name: '), input('text').att('id', 'itemName')),
        div(span('Price: '), input('text').att('id', 'itemPrice')),
        button(span('Add')).click(() => {
          if (itemName.value == "" || itemPrice.value == "") return;

          shoppingItems$.update((items) => {
            items.push({
              name: itemName.value,
              price$: observable(itemPrice.value)
            });
            return items;
          });

          itemName.value = "";
          itemPrice.value = "";
        })
      )
    });

    const shoppingList = () => component({
      render: () => div(
        h2("Shopping items"),
        ul(
          iterable({
            it$: shoppingItems$,
            buildFn: (item) =>
              li(span(template(`${item.name} - $?`, item.price$))),
            keyFn: (item) => item.name,
          })
        )
      )
    });

    const r = router({
      "/": div(
        h1("Grecha.js"),
        div(a("Foo").att("href", "#/foo")),
        div(a("Bar").att("href", "#/bar")),
        counter(),
        shoppingList(),
        shoppingForm()
      ),
      "/foo": component({
        cache: false,
        observables: () => ({ count$: observable(0) }),
        derivedObservables: ({ count$ }) => ({
          paragraphStyle$: mapObservable(
            (count) => `color: ${numberToHexColor(count * 999999)}`, count$)
        }),
        render: ({ count$, paragraphStyle$ }) => div(
          h1("Foo"),
          p(LOREM).att$("style", paragraphStyle$),
          button("Change color").click(() => count$.update((x) => x + 1)),
          div(a("Home").att("href", "#")),
        )
      }),
      "/bar": div(
        h1("Bar"),
        p(LOREM),
        div(a("Home").att("href", "#"))
      )
    });

    function numberToHexColor(number) {
      let hex = (number % 0xffffff).toString(16);
      while (hex.length < 6) hex = "0" + hex;
      return "#" + hex;
    }
    entry.appendChild(r);
  </script>
</body>

</html>
```
