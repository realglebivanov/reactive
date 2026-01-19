const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

function observable(value) {
    let internalValue = value;

    const observers = new Map();

    const notifyObserver = (observer) => {
        try {
            observer(internalValue);
        } catch (e) {
            console.error(e);
        }
    };

    const notifyObservers = () => {
        for (const [_, observer] of observers.entries()) {
            notifyObserver(observer);
        }
    };

    return {
        getValue: () => internalValue,
        unsubscribeAll: () => observers.clear(),
        unsubscribe: (id) => observers.delete(id),
        subscribe: (id, observer) => observers.set(id, observer),
        subscribeInit: function (id, observer) {
            this.subscribe(id, observer);
            notifyObserver(observer);
        },
        updateValue: (fn) => {
            internalValue = fn(internalValue);
            notifyObservers();
        }
    };
}

function joinObservable(joinFn, ...observables) {
    const id = Symbol('JoinObservable');
    const currentValues = observables.map((observable) => observable.getValue());

    const updateValue = (_) => joinFn.apply(undefined, currentValues);
    const joinObservable = observable(updateValue(undefined));

    const notifyObservers = (i) => (newValue) => {
        currentValues[i] = newValue;
        joinObservable.updateValue(updateValue);
    };

    for (const [i, observable] of observables.entries()) {
        observable.subscribe(id, notifyObservers(i));
    }

    return joinObservable;
}

function dedupObservable(innerObservable, compareEqualFn, cloneFn) {
    compareEqualFn = compareEqualFn || ((a, b) => a == b);
    cloneFn = cloneFn || ((x) => x);

    let currentValue = cloneFn(innerObservable.getValue());

    const id = Symbol('DedupObservable');
    const dedupObservable = observable(currentValue);

    innerObservable.subscribe(id, (value) => {
        if (!compareEqualFn(currentValue, value)) {
            currentValue = cloneFn(value);
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

    const updateNode = (parentNode) => (value) => {
        const node = value ? thenNode : otherwiseNode;

        try {
            parentNode.replaceChild(node, currentNode);
            currentNode = node;
        } catch (e) {
            console.error(e);
        }
    };

    return (parentNode) => {
        const updateNodeFn = updateNode(parentNode);
        parentNode.appendChild(currentNode);

        return {
            activate: () => observable.subscribeInit(id, updateNodeFn),
            deactivate: () => observable.unsubscribe(id)
        };
    };
}

function template(template, ...observables) {
    const staticParts = template.split(/(?<!@)\?/)
        .map((staticPart) => staticPart.replace('@?', '?'));

    const nodes = staticParts.map((staticPart, i) => ({
        observerId: Symbol(`Template${i}`),
        staticNode: document.createTextNode(staticPart),
        dynamicNode: i + 1 in staticParts ? document.createTextNode('') : undefined
    }));

    const updateNode = (node) => (value) => node.data = value;

    const attachObservable = (observable, i) => {
        const { observerId, dynamicNode } = nodes[i];

        if (observerId !== undefined && dynamicNode !== undefined) {
            observable.subscribeInit(observerId, updateNode(dynamicNode));
        }
    };

    const detachObservable = (observable, i) => {
        const { observerId } = nodes[i];
        if (observerId !== undefined) observable.unsubscribe(observerId);
    };

    return (parentNode) => {
        for (const { staticNode, dynamicNode } of nodes) {
            parentNode.appendChild(staticNode);
            if (dynamicNode !== undefined) parentNode.appendChild(dynamicNode);
        }

        return {
            activate: () => observables.forEach(attachObservable),
            deactivate: () => observables.forEach(detachObservable)
        };
    };
}

function tag(name, ...children) {
    const result = document.createElement(name);
    const childHandles = [];

    for (const child of children) {
        if (typeof (child) === 'string') {
            result.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            result.appendChild(child);
            childHandles.push(child);
        } else if (typeof (child) === 'function') {
            childHandles.push(child(result));
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

    result.activate = function () {
        if (this._active) return;
        this._active = true;
        for (const handle of childHandles) handle.activate();
    };

    result.deactivate = function () {
        if (!this._active) return;
        this._active = false;
        for (const handle of childHandles) handle.deactivate();
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

    result.enterRoute = function () {
        for (const child of this.childNodes) {
            if (typeof (child.activate) === 'function') child.activate();
        }
    };

    result.exitRoute = function () {
        for (const child of this.childNodes) {
            if (typeof (child.activate) === 'function') child.deactivate();
        }
    };

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

        result.exitRoute();
        result.replaceChildren(routes[hashLocation]);
        result.enterRoute();

        return result;
    };

    syncHash();

    // TODO(#3): there is way to "destroy" an instance of the router to make it remove it's "hashchange" callback
    window.addEventListener("hashchange", syncHash);

    return result;
}
