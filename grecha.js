const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

function observable(value) {
    let internalValue = value;

    const observers = new Map();

    const notifyObservers = () => {
        for (const [_, observer] of observers.entries()) {
            observer(internalValue);
        }
    };

    return {
        getValue: () => internalValue,
        unsubscribe: (id) => observers.delete(id),
        subscribe: (id, observer) => observers.set(id, observer),
        updateValue: (fn) => {
            internalValue = fn(internalValue);
            notifyObservers();
        }
    };
}

function joinObservable(joinFn, ...observables) {
    const id = Symbol('JoinObservable');
    const getValue = () => joinFn.apply(
        undefined,
        observables.map((observable) => observable.getValue()));

    const joinObservable = observable(getValue());
    const notifyObservers = (_) => joinObservable.updateValue((_) => getValue());

    for (const observable of observables) {
        observable.subscribe(id, notifyObservers);
    }

    return joinObservable;
}

function dedupObservable(observable$, compareEqualFn) {
    const id = Symbol('DedupObservable');
    let currentValue = structuredClone(observable$.getValue());
    const dedupObservable = observable(currentValue);

    compareEqualFn = compareEqualFn || ((a, b) => a === b);

    observable$.subscribe(id, (value) => {
        if (!compareEqualFn(currentValue, value)) {
            currentValue = structuredClone(value);
            dedupObservable.updateValue((_) => currentValue);
        }
    });

    return dedupObservable;
}

function cond({ if$, then, otherwise }) {
    const id = Symbol('Cond');
    const observable = dedupObservable(if$);

    const thenNode =
        then instanceof Node ? then : document.createTextNode(then);
    const otherwiseNode =
        otherwise instanceof Node ? otherwise : document.createTextNode(otherwise);
    let currentNode = observable.getValue() ? thenNode : otherwiseNode;

    const updateNode = (parentNode, value) => {
        const node = value ? thenNode : otherwiseNode;
        parentNode.replaceChild(node, currentNode);
        currentNode = node;
    };

    return (parentNode) => {
        parentNode.appendChild(currentNode);
        observable.subscribe(id, (value) => updateNode(parentNode, value));
    };
}

function template(buildText, ...observables) {
    const id = Symbol('Template');
    const observable = joinObservable((...values) => values, ...observables);

    const getText = (values) => buildText.apply(undefined, values);
    const node = document.createTextNode(getText(observable.getValue()));

    return (parentNode) => {
        parentNode.appendChild(node);
        observable.subscribe(id, (values) => node.data = getText(values));
    };
}

function tag(name, ...children) {
    const result = document.createElement(name);
    for (const child of children) {
        if (typeof (child) === 'string') {
            result.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            result.appendChild(child);
        } else if (typeof (child) === 'function') {
            child(result);
        }
    }

    result.att$ = function (name, value) {
        this.setAttribute(name, value);
        return this;
    };

    result.onclick$ = function (callback) {
        this.onclick = callback;
        return this;
    };

    return result;
}

const MUNDANE_TAGS = ["canvas", "h1", "h2", "h3", "p", "a", "div", "span", "select"];
for (let tagName of MUNDANE_TAGS) {
    window[tagName] = (...children) => tag(tagName, ...children);
}

function img(src) {
    return tag("img").att$("src", src);
}

function input(type) {
    return tag("input").att$("type", type);
}

function router(routes) {
    let result = div();

    function syncHash() {
        let hashLocation = document.location.hash.split('#')[1];
        if (!hashLocation) {
            hashLocation = '/';
        }

        if (!(hashLocation in routes)) {
            // TODO(#2): make the route404 customizable in the router component
            const route404 = '/404';

            console.assert(route404 in routes);
            hashLocation = route404;
        }

        result.replaceChildren(routes[hashLocation]);

        return result;
    };

    syncHash();

    // TODO(#3): there is way to "destroy" an instance of the router to make it remove it's "hashchange" callback
    window.addEventListener("hashchange", syncHash);

    result.refresh = syncHash;

    return result;
}
