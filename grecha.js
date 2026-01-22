const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

const buildMicrotaskRunner = function () {
    const tasks = new Set();
    const enqueue = () => queueMicrotask(() => {
        const run = Array.from(tasks);
        tasks.clear();
        for (const task of run) task();
    });

    return (task) => {
        if (tasks.has(task)) return;
        tasks.add(task);
        if (tasks.size > 1) return;
        enqueue();
    };
};

const microtaskRunner = buildMicrotaskRunner();

function component({
    render,
    observables = (() => ({})),
    derivedObservables = (() => ({})),
    cache = true
}) {
    let componentNode, componentObservables;

    const buildObservables = () => {
        const coreObservables = observables();
        const extraObservables = derivedObservables(coreObservables);

        return Object.assign(
            Object.assign({}, coreObservables), 
            extraObservables);
    };

    const getOrBuildObservables = () => {
        if (componentObservables === undefined)
            return componentObservables = 
                componentObservables || buildObservables();
        
        if (cache) return componentObservables;

        return componentObservables = buildObservables();
    };

    const cleanUp = () => {
        if (cache) return;
        componentNode = undefined, componentObservables = undefined;
    }

    const commentNode = document.createComment('Component');

    return Object.assign(commentNode, buildSwitch({
        activate: () => {
            if (commentNode.parentNode === null)
                return console.warn("Node wasn't mounted before activation");

            if (componentNode === undefined || !cache)
                componentNode = render(getOrBuildObservables());

            commentNode.parentNode.appendChild(componentNode);
            componentNode.activate();
        },
        deactivate: () => {
            if (commentNode.parentNode === null)
                return console.warn("Node wasn't mounted before deactivation");

            componentNode.deactivate();
            commentNode.parentNode.removeChild(componentNode);
            cleanUp();
        }
    }));
}

function observable(value, opts) {
    const taskRunner = opts?.microtaskRunner || microtaskRunner;
    const observers = new Map();

    let internalValue = value;

    const notify = (id, observer) => {
        try {
            if (observers.get(id) === observer) observer(internalValue);
        } catch (e) {
            console.error(e);
        }
    };

    const notifyAll = () => {
        for (const [id, observer] of observers.entries())
            notify(id, observer);
    };

    return {
        unsubscribeAll: () => observers.clear(),
        unsubscribe: (id) => observers.delete(id),
        subscribe: (id, observer) => {
            if (observers.has(id)) console.warn("Duplicate observer id", id);
            observers.set(id, observer);
        },
        subscribeInit: function (id, observer) {
            this.subscribe(id, observer);
            taskRunner(() => notify(id, observer));
        },
        update: (fn) => {
            internalValue = fn(internalValue);
            taskRunner(notifyAll);
        }
    };
};

function mapObservable(mapFn, ...observables) {
    const ids = Array.from(observables, () => Symbol('MapObservable'));
    const currentValues = new Array(observables.length);
    const initializedIndices = new Set();
    const observers = new Map();

    const notifyObservers = (i) => (newValue) => {
        currentValues[i] = newValue;
        initializedIndices.add(i);

        if (initializedIndices.size !== currentValues.length) return;

        for (const observer of observers.values())
            observer(mapFn(...currentValues));
    };

    const innerSubscribe = () => {
        if (observers.size !== 1) return;
        for (const [i, observable] of observables.entries()) {
            observable.subscribeInit(ids[i], notifyObservers(i));
        }
    };

    const innerUnubscribe = () => {
        if (observers.size !== 0) return;
        for (const [i, observable] of observables.entries()) {
            observable.unsubscribe(ids[i]);
        }
    };

    return {
        unsubscribeAll: () => {
            observers.clear();
            innerUnubscribe();
        },
        unsubscribe: (id) => {
            observers.delete(id);
            innerUnubscribe();
        },
        subscribe: (id, observer) => {
            observers.set(id, observer);
            innerSubscribe();
        },
        subscribeInit: function (id, observer) {
            this.subscribe(id, observer);
        }
    };
}

function dedupObservable(
    innerObservable,
    compareEqualFn = ((a, b) => a == b),
    cloneFn = ((x) => x)
) {
    const id = Symbol('DedupObservable');
    let currentValue, isInitialized = false;

    const innerSubscribe = () => {
        if (observers.size !== 1) return;
        innerObservable.subscribeInit(id, (value) => {
            if (isInitialized && compareEqualFn(currentValue, value)) return;
            currentValue = cloneFn(value), isInitialized = true;
            for (const observer of observers.values()) observer(currentValue);
        });
    };

    const innerUnubscribe = () => {
        if (observers.size !== 0) return;
        currentValue = undefined, isInitialized = false;
        innerObservable.unsubscribe(id);
    };

    const observers = new Map();

    return {
        unsubscribeAll: () => {
            observers.clear();
            innerUnubscribe();
        },
        unsubscribe: (id) => {
            observers.delete(id);
            innerUnubscribe();
        },
        subscribe: (id, observer) => {
            observers.set(id, observer);
            innerSubscribe();
        },
        subscribeInit: function (id, observer) {
            this.subscribe(id, observer);
        }
    };
}

function buildSwitch({ activate, deactivate }) {
    let active = false;
    return {
        activate: () => {
            if (active) return;
            active = true;
            activate();
        },
        deactivate: () => {
            if (!active) return;
            active = false;
            deactivate();
        },
    };
}

function iterable({ it$, buildFn, keyFn }) {
    const id = Symbol('Iterable');
    const valueId = Symbol();

    const builderFn = (buildFn) => {
        switch (buildFn.length) {
            case 1:
                return (_key, value) => buildFn(value);
            case 2:
                return (key, value) => buildFn(key, value);
            default:
                throw new Error(`Invalid fn given: ${buildFn.name}`);
        }
    };


    const buildKey = builderFn(keyFn);
    const buildNode = builderFn(buildFn);
    const currentNodes = new Map();

    let nodeGeneration = 0;

    const removeStaleNodes = () => {
        for ([key, node] of currentNodes.entries()) {
            if (node[id] === nodeGeneration) continue;
            node.deactivate();
            node.remove();
            currentNodes.delete(key);
        }
    }

    const createNode = (key, value) => {
        const newNode = buildNode(key, value);
        currentNodes.set(key, newNode);
        newNode[valueId] = value;
        return newNode;
    };

    const adjustNode = (node, parentNode, refNode) => {
        if (node.nextSibling == null || !node.nextSibling.isSameNode(refNode)) {
            parentNode.insertBefore(node, refNode);
            if (node[id] === undefined) node.activate();
        }

        node[id] = nodeGeneration;

        return node;
    };

    const rebuildOrCreateNode = (node, key, value) => {
        if (node === undefined) return createNode(key, value);
        if (node[valueId] === value) return node;
        node.deactivate();
        node.remove();
        return createNode(key, value);
    };

    const updateNodes = (parentNode, newValue) => {
        nodeGeneration++;
        let refNode = null;

        for (const [k, value] of newValue.entries()) {
            const key = buildKey(k, value);
            const node = rebuildOrCreateNode(currentNodes.get(key), key, value);
            adjustNode(node, parentNode, refNode);
            refNode = node.nextSibling;
        }

        removeStaleNodes();
    };

    const deactivate = () => {
        it$.unsubscribe(id);
        for (const node of currentNodes.values()) {
            node.deactivate();
            node.remove();
        }
        currentNodes.clear();
    };

    const commentNode = document.createComment('Iterable');
    const updateNodeFn = (newValue) => {
        if (commentNode.parentNode !== null)
            updateNodes(commentNode.parentNode, newValue);
    };

    return Object.assign(commentNode, buildSwitch({
        activate: () => it$.subscribeInit(id, updateNodeFn),
        deactivate
    }));
}


function cond({ if$, then, otherwise }) {
    const id = Symbol('Cond');
    const observable = dedupObservable(if$);

    const buildNode = (node) => {
        if (typeof (node) === 'function') return node();
        if (typeof (node) === 'string') return document.createTextNode(node);
        throw new Error('Then/otherwise should be either strings or functions');
    };

    const [thenNode, otherwiseNode] = [buildNode(then), buildNode(otherwise)];

    let currentNode = null;

    const detachCurrentNode = () => {
        if (currentNode === null) return;
        if (currentNode.deactivate !== undefined) currentNode.deactivate();
        currentNode.remove();
        currentNode = null;
    }

    const switchNode = (parentNode, node) => {
        if (currentNode?.deactivate !== undefined) currentNode.deactivate();
        if (node.activate !== undefined) node.activate();

        currentNode === null ?
            parentNode.appendChild(node) : currentNode.replaceWith(node);

        currentNode = node;
    };

    const deactivate = (parentNode) => {
        observable.unsubscribe(id);
        try {
            detachCurrentNode(parentNode);
        } catch (e) {
            console.error(e);
        }
    };

    const updateNode = (parentNode, value) => {
        try {
            switchNode(parentNode, value ? thenNode : otherwiseNode);
        } catch (e) {
            console.error(e);
        }
    };

    const commentNode = document.createComment('Cond');
    const updateNodeFn = (value) => {
        if (commentNode.parentNode !== null)
            updateNode(commentNode.parentNode, value);
    };

    return Object.assign(commentNode, buildSwitch({
        activate: () => observable.subscribe(id, updateNodeFn),
        deactivate: () => deactivate(commentNode.parentNode)
    }));
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
        if (observerId === undefined || dynamicNode === undefined) return;
        observable.subscribeInit(observerId, updateNode(dynamicNode));
    };

    const detachObservable = (observable, i) => {
        const { observerId } = nodes[i];
        if (observerId === undefined) return;
        observable.unsubscribe(observerId);
    };

    const appendNodes = () => {
        const parentNode = commentNode.parentNode;

        if (parentNode === null)
            return console.warn("Node wasn't mounted before activation");

        for (const { staticNode, dynamicNode } of nodes) {
            parentNode.appendChild(staticNode);
            if (dynamicNode !== undefined) parentNode.appendChild(dynamicNode);
        }
    };

    const removeNodes = () => {
        const parentNode = commentNode.parentNode;

        if (parentNode === null)
            return console.warn("Node wasn't mounted before deactivation");

        for (const { staticNode, dynamicNode } of nodes) {
            parentNode.removeChild(staticNode);
            if (dynamicNode !== undefined) parentNode.removeChild(dynamicNode);
        }
    };

    const commentNode = document.createComment('Template');

    return Object.assign(commentNode, buildSwitch({
        activate: () => {
            appendNodes();
            observables.forEach(attachObservable)
        },
        deactivate: () => {
            removeNodes();
            observables.forEach(detachObservable)
        }
    }));
}

function tag(name, ...children) {
    const result = document.createElement(name);
    const handlers = [];

    for (const child of children) {
        if (typeof (child) === 'string') {
            const node = document.createTextNode(child);
            node.activate = node.deactivate = (() => undefined);
            result.appendChild(node);
        } else if (child instanceof Node) {
            result.appendChild(child);
            handlers.push(child);
        }
    }

    result.att = function (name, value) {
        this.setAttribute(name, value);
        return this;
    };

    result.att$ = function (name, value$) {
        const subscriberId = Symbol(`Attribute: ${name}`)

        handlers.push({
            activate: () => value$.subscribeInit(
                subscriberId,
                value => this.setAttribute(name, value)),
            deactivate: () => value$.unsubscribe(subscriberId)
        });

        return this;
    };

    result.click = function (callback) {
        handlers.push({
            activate: () => this.addEventListener('click', callback),
            deactivate: () => this.removeEventListener('click', callback)
        });
        return this;
    };

    Object.assign(result, buildSwitch({
        activate: () => {
            for (const handler of handlers) handler.activate();
        },
        deactivate: () => {
            for (const handler of handlers) handler.deactivate();
        }
    }));

    return result;
}

const MUNDANE_TAGS = ["canvas", "button", "h1", "h2", "h3", "p", "a", "div", "ul", "li", "span", "select"];
for (let tagName of MUNDANE_TAGS) {
    window[tagName] = (...children) => tag(tagName, ...children);
}

function img(src) {
    return tag("img").att("src", src);
}

function input(type) {
    return tag("input").att("type", type);
}

function router(routes) {
    const router = div();
    let currentNode = null;

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

        currentNode?.deactivate();
        currentNode = routes[hashLocation];
        router.replaceChildren(currentNode);
        currentNode.activate();

        return router;
    };

    syncHash();

    // TODO(#3): there is way to "destroy" an instance of the router to make it remove it's "hashchange" callback
    window.addEventListener("hashchange", syncHash);

    return router;
}
