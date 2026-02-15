// src/observables/notifier.ts
class Notifier {
  observers = new Map;
  notifyAll = false;
  notifySchedule = new Set;
  get size() {
    return this.observers.size;
  }
  scheduleNotify(id) {
    if (!this.notifyAll)
      this.notifySchedule.add(id);
  }
  scheduleNotifyAll() {
    this.notifySchedule.clear();
    this.notifyAll = true;
  }
  clearSchedule() {
    this.notifyAll = false;
    this.notifySchedule.clear();
  }
  clear() {
    this.observers.clear();
  }
  set(id, observer) {
    if (this.observers.has(id))
      console.warn("Duplicate observer id", id);
    this.observers.set(id, observer);
  }
  delete(id) {
    this.observers.delete(id);
  }
  notifyTargets(value) {
    if (this.notifyAll) {
      for (const observer of this.observers.values())
        this.notify(observer, value);
    } else {
      for (const id of this.notifySchedule) {
        this.notify(this.observers.get(id), value);
      }
    }
  }
  resetTargets() {
    this.notifyAll = false;
    this.notifySchedule.clear();
  }
  notify(observer, value) {
    try {
      if (observer !== undefined)
        observer(value);
    } catch (e) {
      console.error(e);
    }
  }
}

// src/ring.queue.ts
class RingQueue {
  size = 0;
  head = 0;
  tail = 0;
  items;
  constructor(capacity = 256) {
    this.items = new Array(capacity);
  }
  get isEmpty() {
    return this.size === 0;
  }
  clear() {
    this.size = 0;
    this.tail = 0;
    this.head = 0;
  }
  enqueue(item) {
    if (this.size === this.items.length)
      this.extend();
    this.items[this.tail] = item;
    this.tail = (this.tail + 1) % this.items.length;
    this.size++;
  }
  dequeue() {
    if (this.size === 0)
      return;
    const item = this.items[this.head];
    this.items[this.head] = undefined;
    this.head = (this.head + 1) % this.items.length;
    this.size--;
    return item;
  }
  extend() {
    const newItems = new Array(this.size * 2);
    for (let i = 0;i < this.size; i++)
      newItems[i] = this.items[(this.head + i) % this.items.length];
    this.items = newItems;
    this.head = 0;
    this.tail = this.size;
  }
}

// src/observables/scheduler.ts
var buildScheduleFun = () => {
  const flushIds = new WeakMap;
  let flushId = 0;
  let status = 1 /* Idle */;
  let tasks = new RingQueue;
  let nextTasks = new RingQueue;
  const runner = () => {
    while (true) {
      [tasks, nextTasks] = [nextTasks, tasks];
      nextTasks.clear();
      let task;
      while (task = tasks.dequeue())
        task.run();
      if (nextTasks.isEmpty)
        break;
    }
  };
  const enqueueMicrotask = () => queueMicrotask(() => {
    runner();
    status = 1 /* Idle */;
    flushId++;
  });
  return (task) => {
    const taskFlushId = flushIds.get(task);
    if (taskFlushId === flushId)
      return;
    flushIds.set(task, flushId);
    nextTasks.enqueue(task);
    if (status === 0 /* Scheduled */)
      return;
    status = 0 /* Scheduled */;
    enqueueMicrotask();
  };
};
var scheduler = {
  enqueueSubscription: buildScheduleFun(),
  enqueueUpdate: buildScheduleFun()
};

// src/observables/map.observable/state.ts
class Initialized {
  values;
  constructor(values) {
    this.values = values;
  }
  update(i, value) {
    this.values[i] = value;
    return this;
  }
}

class Uninitialized {
  initializedSize;
  initializedIndices = new Set;
  values;
  constructor(initializedSize) {
    this.initializedSize = initializedSize;
    this.values = new Array(initializedSize).fill(undefined);
  }
  update(i, value) {
    this.initializedIndices.add(i);
    this.values[i] = value;
    if (this.initializedIndices.size === this.initializedSize)
      return new Initialized(this.values);
    else
      return this;
  }
}

// src/observables/map.observable/index.ts
var mapObservable = (mapFn, ...observables) => new MapObservable(mapFn, observables);

class MapObservable {
  mapFn;
  observables;
  notifier = new Notifier;
  state;
  ids;
  constructor(mapFn, observables) {
    this.mapFn = mapFn;
    this.observables = observables;
    this.ids = Array.from(this.observables, () => Symbol("MapObservable"));
    this.state = new Uninitialized(this.ids.length);
  }
  unsubscribeAll() {
    this.notifier.clear();
    this.innerUnubscribe();
  }
  unsubscribe(id) {
    this.notifier.delete(id);
    this.innerUnubscribe();
  }
  subscribe(id, observer) {
    this.notifier.set(id, observer);
    this.innerSubscribe();
  }
  subscribeInit(id, observer) {
    this.subscribe(id, observer);
    this.notifier.scheduleNotify(id);
    scheduler.enqueueSubscription(this);
  }
  run() {
    if (this.state instanceof Uninitialized)
      return;
    this.notifier.notifyTargets(this.mapFn(...this.state.values));
    this.notifier.resetTargets();
  }
  notifyObservers(i) {
    return (newValue) => {
      this.state = this.state.update(i, newValue);
      if (this.state instanceof Uninitialized)
        return;
      this.notifier.scheduleNotifyAll();
      scheduler.enqueueUpdate(this);
    };
  }
  innerSubscribe() {
    if (this.notifier.size !== 1)
      return;
    for (const [i, observable] of this.observables.entries())
      if (this.ids[i] !== undefined)
        observable.subscribeInit(this.ids[i], this.notifyObservers(i));
  }
  innerUnubscribe() {
    if (this.notifier.size !== 0)
      return;
    for (const [i, observable] of this.observables.entries()) {
      if (this.ids[i] !== undefined)
        observable.unsubscribe(this.ids[i]);
    }
    this.state = new Uninitialized(this.ids.length);
  }
}

// src/observables/value.observable.ts
var observable = (value) => new ValueObservable(value);

class ValueObservable {
  value;
  notifier = new Notifier;
  constructor(value) {
    this.value = value;
  }
  unsubscribeAll() {
    this.notifier.clear();
  }
  unsubscribe(id) {
    this.notifier.delete(id);
  }
  subscribe(id, observer) {
    this.notifier.set(id, observer);
  }
  subscribeInit(id, observer) {
    this.notifier.set(id, observer);
    this.notifier.scheduleNotify(id);
    scheduler.enqueueSubscription(this);
  }
  update(updateFn) {
    this.value = updateFn(this.value);
    this.notifier.scheduleNotifyAll();
    scheduler.enqueueUpdate(this);
  }
  run() {
    this.notifier.notifyTargets(this.value);
    this.notifier.resetTargets();
  }
}
// src/observables/dedup.observable.ts
var dedupObservable = (innerObservable, compareEqualFn = (a, b) => a == b, cloneFn = (a) => a) => new DedupObservable(innerObservable, compareEqualFn, cloneFn);

class DedupObservable {
  innerObservable;
  compareEqualFn;
  cloneFn;
  id = Symbol("DedupObservable");
  state = { initialized: false };
  boundUpdate = this.updateValue.bind(this);
  notifier = new Notifier;
  constructor(innerObservable, compareEqualFn, cloneFn) {
    this.innerObservable = innerObservable;
    this.compareEqualFn = compareEqualFn;
    this.cloneFn = cloneFn;
  }
  unsubscribeAll() {
    this.notifier.clear();
    this.innerUnubscribe();
  }
  unsubscribe(id) {
    this.notifier.delete(id);
    this.innerUnubscribe();
  }
  subscribe(id, observer) {
    this.notifier.set(id, observer);
    this.innerSubscribe();
  }
  subscribeInit(id, observer) {
    this.subscribe(id, observer);
    this.notifier.scheduleNotify(id);
    scheduler.enqueueSubscription(this);
  }
  run() {
    if (!this.state.initialized)
      return;
    this.notifier.notifyTargets(this.state.value);
    this.notifier.resetTargets();
  }
  innerSubscribe() {
    if (this.notifier.size !== 1)
      return;
    this.innerObservable.subscribeInit(this.id, this.boundUpdate);
  }
  updateValue(value) {
    if (this.state.initialized && this.compareEqualFn(this.state.value, value))
      return;
    if (this.state.initialized)
      this.state.value = this.cloneFn(value);
    else
      this.state = { initialized: true, value: this.cloneFn(value) };
    this.notifier.scheduleNotifyAll();
    scheduler.enqueueUpdate(this);
  }
  innerUnubscribe() {
    if (this.notifier.size !== 0)
      return;
    this.state = { initialized: false };
    this.innerObservable.unsubscribe(this.id);
  }
}
// src/observables/scoped.observable.ts
var scopedObservable = (innerObservable) => new ScopedObservable(innerObservable);

class ScopedObservable {
  innerObservable;
  aliases = new Map;
  constructor(innerObservable) {
    this.innerObservable = innerObservable;
  }
  unsubscribeAll() {
    for (const alias of this.aliases.values())
      this.innerObservable.unsubscribe(alias);
    this.aliases.clear();
  }
  unsubscribe(id) {
    const alias = this.aliases.get(id);
    if (alias === undefined)
      return;
    this.aliases.delete(id);
    this.innerObservable.unsubscribe(alias);
  }
  subscribe(id, observer) {
    const alias = Symbol("ScopedObservable");
    this.aliases.set(id, alias);
    this.innerObservable.subscribe(alias, observer);
  }
  subscribeInit(id, observer) {
    const alias = Symbol("ScopedObservable");
    this.aliases.set(id, alias);
    this.innerObservable.subscribeInit(alias, observer);
  }
  update(updateFn) {
    if ("update" in this.innerObservable)
      this.innerObservable.update(updateFn);
  }
}
// src/observables/input.observable.ts
var inputObservable = (input, value$) => new InputObservable(input, value$);

class InputObservable {
  input;
  value$;
  aliases = new Map;
  constructor(input, value$) {
    this.input = input;
    this.value$ = value$;
  }
  subscribe(id, observer) {
    if (this.aliases.has(id))
      return;
    const alias = Symbol("InputObservable");
    this.aliases.set(id, alias);
    this.value$.subscribe(alias, this.toInputObserver(observer));
  }
  subscribeInit(id, observer) {
    if (this.aliases.has(id))
      return;
    const alias = Symbol("InputObservable");
    this.aliases.set(id, alias);
    this.value$.subscribeInit(alias, this.toInputObserver(observer));
  }
  unsubscribe(id) {
    const alias = this.aliases.get(id);
    if (alias === undefined)
      return;
    this.value$.unsubscribe(alias);
    this.aliases.delete(id);
  }
  unsubscribeAll() {
    for (const alias of this.aliases.values())
      this.value$.unsubscribe(alias);
    this.aliases.clear();
  }
  update(updateFn) {
    this.value$.update(updateFn);
  }
  toInputObserver(observer) {
    return (value) => {
      if (this.input.value !== value)
        observer(value);
    };
  }
}

// src/observables/index.ts
var once = (fn, ...observables) => {
  const id = Symbol("Once");
  const observable2 = mapObservable((...values) => values, ...observables);
  observable2.subscribeInit(id, (values) => {
    observable2.unsubscribe(id);
    fn(...values);
  });
};
// src/reactive/lifecycle.ts
var ReactiveNodeStatus;
((ReactiveNodeStatus2) => {
  ReactiveNodeStatus2[ReactiveNodeStatus2["Active"] = 0] = "Active";
  ReactiveNodeStatus2[ReactiveNodeStatus2["Inactive"] = 1] = "Inactive";
  ReactiveNodeStatus2[ReactiveNodeStatus2["Mounted"] = 2] = "Mounted";
  ReactiveNodeStatus2[ReactiveNodeStatus2["Unmounted"] = 3] = "Unmounted";
})(ReactiveNodeStatus ||= {});
var buildLifecycleHooks = (handlers) => {
  let status = 3 /* Unmounted */;
  return {
    mount: (parentNode) => {
      if (status !== 3 /* Unmounted */)
        return console.warn(`Mounting in status ${ReactiveNodeStatus[status]}`);
      for (const handler of handlers)
        handler.mount(parentNode);
      status = 2 /* Mounted */;
    },
    activate: () => {
      if (status !== 2 /* Mounted */ && status !== 1 /* Inactive */)
        return console.warn(`Activating in status ${ReactiveNodeStatus[status]}`);
      for (const handler of handlers)
        handler.activate();
      status = 0 /* Active */;
    },
    deactivate: () => {
      if (status !== 0 /* Active */)
        return console.warn(`Deactivating in status ${ReactiveNodeStatus[status]}`);
      for (const handler of handlers)
        handler.deactivate();
      status = 1 /* Inactive */;
    },
    unmount() {
      if (status !== 1 /* Inactive */)
        return console.warn(`Unmounting in status ${ReactiveNodeStatus[status]}`);
      for (const handler of handlers)
        handler.unmount();
      status = 3 /* Unmounted */;
    }
  };
};

// src/reactive/extensions.ts
var toTagReactiveNode = (node, handlers) => {
  const internalHandlers = [...handlers];
  const tagNodeSetters = buildTagNodeSetters(internalHandlers);
  const nodeSetters = buildNodeSetters(internalHandlers);
  const hooks = buildLifecycleHooks(internalHandlers);
  return Object.assign(node, nodeSetters, tagNodeSetters, hooks);
};
var toReactiveNode = (node, handlers) => {
  const internalHandlers = [...handlers];
  const nodeSetters = buildNodeSetters(internalHandlers);
  const hooks = buildLifecycleHooks(internalHandlers);
  return Object.assign(node, nodeSetters, hooks);
};
var buildTagNodeSetters = (handlers) => ({
  att: function(name, value2) {
    this.setAttribute(name, value2);
    return this;
  },
  class$: function(value$) {
    return this.att$("class", value$);
  },
  att$: function(name, value$) {
    const subscriberId = Symbol(`Attribute: ${name}`);
    handlers.push({
      mount: (_) => {
        return;
      },
      activate: () => value$.subscribeInit(subscriberId, (value2) => this.setAttribute(name, value2)),
      deactivate: () => value$.unsubscribe(subscriberId),
      unmount: () => {
        return;
      }
    });
    return this;
  },
  model$: function(value$) {
    const input$ = inputObservable(this, value$);
    return this.prop$("value", input$).listen("input", (_e) => input$.update((_) => this.value));
  },
  prop$: function(name, value$) {
    const subscriberId = Symbol(`Property: ${name.toString()}`);
    handlers.push({
      mount: (_) => {
        return;
      },
      activate: () => value$.subscribeInit(subscriberId, (value2) => this[name] = value2),
      deactivate: () => value$.unsubscribe(subscriberId),
      unmount: () => {
        return;
      }
    });
    return this;
  }
});
var buildNodeSetters = (handlers) => ({
  clk: function(callback) {
    return this.listen("click", callback);
  },
  listen: function(type, callback) {
    handlers.push({
      mount: (_) => {
        return;
      },
      activate: () => this.addEventListener(type, callback),
      deactivate: () => this.removeEventListener(type, callback),
      unmount: () => {
        return;
      }
    });
    return this;
  }
});

// src/nodes/component.ts
var defaultOpts = {
  observables: () => ({}),
  derivedObservables: () => ({}),
  cache: false,
  props: {}
};
var component = (opts) => new Component(Object.assign({}, defaultOpts, opts)).toReactiveNode();

class Context {
  parent;
  props;
  node;
  constructor(parent, props) {
    this.parent = parent;
    this.props = props;
  }
}

class Component {
  opts;
  node;
  observables;
  context;
  constructor(opts) {
    this.opts = opts;
  }
  toReactiveNode() {
    return toReactiveNode(document.createComment("Component"), [{
      mount: (parentNode) => {
        if (this.node === undefined || !this.opts.cache)
          this.setupNode(parentNode);
        this.node?.mount(parentNode);
      },
      activate: () => this.node?.activate(),
      deactivate: () => {
        this.node?.deactivate();
        if (this.observables === undefined)
          return;
        for (const key in this.observables)
          this.observables[key]?.unsubscribeAll();
      },
      unmount: () => {
        this.node?.unmount();
        if (!this.opts.cache)
          this.cleanUp();
      }
    }]);
  }
  setupNode(parentNode) {
    this.observables = this.buildObservables();
    this.context = new Context(parentNode, this.opts.props);
    this.node = this.opts.render.call(this.context, this.observables);
    this.context.node = this.node;
  }
  cleanUp() {
    if (this.context !== undefined)
      this.context.node = undefined;
    this.node = undefined;
    this.observables = undefined;
  }
  buildObservables() {
    const coreObservables = this.opts.observables();
    const derivedObservables = this.opts.derivedObservables(coreObservables);
    const observables = Object.assign({}, coreObservables, derivedObservables);
    return this.toScoped(observables);
  }
  toScoped(observables) {
    const scopedObservables = {};
    for (const key in observables) {
      const k = key;
      scopedObservables[k] = scopedObservable(observables[k]);
    }
    return scopedObservables;
  }
}
// src/reactive/array.ts
class ReactiveArray {
  items;
  observables = [];
  constructor(items = []) {
    this.items = items;
  }
  get observable$() {
    const obs$ = observable({ type: "replace", items: this.items });
    this.observables.push(new WeakRef(obs$));
    return obs$;
  }
  push(...items) {
    this.items.push(...items);
    this.emit({ type: "append", items });
  }
  pop() {
    if (this.items.length === 0)
      return;
    const index = this.items.length - 1;
    const value2 = this.items.pop();
    this.emit({ type: "remove", items: new Map().set(index, value2) });
    return value2;
  }
  remove(indices) {
    if (indices.length == 0)
      return;
    const eventItems = new Map;
    for (const idx of indices) {
      if (!(idx in this.items))
        continue;
      eventItems.set(idx, this.items[idx]);
      delete this.items[idx];
    }
    this.emit({ type: "remove", items: eventItems });
  }
  replace(items) {
    this.items = items;
    this.emit({ type: "replace", items });
  }
  replaceKeys(items) {
    for (const [idx, value2] of items.entries()) {
      if (!(idx in this.items))
        continue;
      this.items[idx] = value2;
    }
    this.emit({ type: "replaceKeys", items });
  }
  emit(event) {
    const updateFn = (_) => event;
    for (const obs$ of this.observables)
      obs$.deref()?.update(updateFn);
  }
}
// src/nodes/reactive.ts
var reactiveTextNode = (text) => {
  const textNode = document.createTextNode(text);
  const hooks = [{
    mount: (parentNode) => parentNode.appendChild(textNode),
    activate: () => {
      return;
    },
    deactivate: () => {
      return;
    },
    unmount: () => textNode.remove()
  }];
  return toReactiveNode(textNode, hooks);
};

// src/nodes/cond.ts
var cond = ({ if$, then, otherwise }) => new Cond(dedupObservable(if$), then, otherwise).toReactiveNode();

class Cond {
  if$;
  then;
  otherwise;
  id = Symbol("Cond");
  currentNode;
  constructor(if$, then, otherwise) {
    this.if$ = if$;
    this.then = then;
    this.otherwise = otherwise;
  }
  toReactiveNode() {
    const anchor = document.createComment("Cond");
    const updateFn = (value2) => this.updateNode(anchor, value2);
    return toReactiveNode(anchor, [{
      mount: (parentNode) => parentNode.appendChild(anchor),
      activate: () => this.if$.subscribeInit(this.id, updateFn),
      deactivate: () => {
        this.if$.unsubscribe(this.id);
        this.currentNode?.deactivate();
      },
      unmount: () => {
        this.currentNode?.unmount();
        this.currentNode = undefined;
        anchor.remove();
      }
    }]);
  }
  updateNode(anchor, value2) {
    const newNode = value2 ? this.buildNode(this.then) : this.buildNode(this.otherwise);
    try {
      this.switchNode(anchor, newNode);
    } catch (e) {
      console.error(e);
    }
  }
  buildNode(node) {
    if (typeof node === "function")
      return node();
    if (typeof node === "string")
      return reactiveTextNode(node);
    if (node === undefined)
      return;
    throw new Error("Then/otherwise should be either string or function");
  }
  switchNode(anchor, newNode) {
    this.currentNode?.deactivate();
    this.currentNode?.unmount();
    this.currentNode = newNode;
    if (newNode === undefined)
      return;
    newNode.mount(anchor.parentNode);
    anchor.parentNode?.insertBefore(newNode, anchor.nextSibling);
    newNode.activate();
  }
}
// src/nodes/iterable/item.ts
class ReactiveItem {
  anchor;
  value;
  node;
  generationId;
  constructor(anchor, value2, node) {
    this.anchor = anchor;
    this.value = value2;
    this.node = node;
  }
  mount(refItem) {
    const parentNode = this.anchor.parentNode;
    const insertBefore = refItem?.node.nextSibling || null;
    if (parentNode === null)
      return;
    if (this.node.parentNode === null)
      this.node.mount(parentNode);
    parentNode.insertBefore(this.node, insertBefore);
  }
  activate(generationId) {
    if (this.generationId === undefined)
      this.node.activate();
    this.generationId = generationId;
  }
  deactivate() {
    this.node.deactivate();
  }
  unmount() {
    this.node.unmount();
  }
}

// src/nodes/iterable/collection.ts
class ReactiveItemCollection {
  keyFn;
  buildFn;
  generationId = 0;
  items = new Map;
  constructor(keyFn, buildFn) {
    this.keyFn = keyFn;
    this.buildFn = buildFn;
  }
  deactivate() {
    for (const item of this.items.values())
      item.deactivate();
  }
  unmount() {
    for (const item of this.items.values())
      item.unmount();
    this.items.clear();
    this.generationId = 0;
  }
  replace(anchor, newItems) {
    this.generationId++;
    let refItem = null;
    for (const [k, value2] of newItems.entries()) {
      const key = this.keyFn(k, value2);
      const item = this.getOrInsert(anchor, refItem, key, value2);
      item.generationId = this.generationId;
      refItem = item;
    }
    this.removeStaleItems();
  }
  replaceKeys(anchor, items) {
    for (const [k, value2] of items.entries()) {
      const key = this.keyFn(k, value2);
      const refItem = this.items.get(key);
      if (refItem === undefined)
        continue;
      this.insertItem(anchor, refItem, key, value2);
      refItem.deactivate();
      refItem.unmount();
    }
  }
  append(anchor, newItems) {
    for (const [k, value2] of newItems.entries()) {
      const key = this.keyFn(k, value2);
      this.insertItem(anchor, null, key, value2);
    }
  }
  remove(items) {
    for (const [k, value2] of items.entries()) {
      const key = this.keyFn(k, value2);
      const item = this.items.get(key);
      if (item === undefined)
        continue;
      item.deactivate();
      item.unmount();
      this.items.delete(key);
    }
  }
  getOrInsert(anchor, refItem, key, value2) {
    const item = this.items.get(key);
    if (item === undefined)
      return this.insertItem(anchor, refItem, key, value2);
    if (item.value === value2)
      return item;
    item.deactivate();
    item.unmount();
    return this.insertItem(anchor, refItem, key, value2);
  }
  insertItem(anchor, refItem, key, value2) {
    const newNode = this.buildFn(key, value2);
    const item = new ReactiveItem(anchor, value2, newNode);
    item.mount(refItem);
    item.activate(this.generationId);
    this.items.set(key, item);
    return item;
  }
  removeStaleItems() {
    for (const [key, item] of this.items.entries()) {
      if (item.generationId === this.generationId)
        continue;
      item.deactivate();
      item.unmount();
      this.items.delete(key);
    }
  }
}

// src/nodes/iterable.ts
var iterable = ({ it$, buildFn, keyFn }) => new Iterable(it$, buildFn, keyFn).toReactiveNode();

class Iterable {
  id = Symbol("Iterable");
  it$;
  items;
  constructor(it$, buildFn, keyFn) {
    this.it$ = this.toEventObservable(it$);
    this.items = new ReactiveItemCollection(keyFn, buildFn);
  }
  toReactiveNode() {
    const anchor = document.createComment("Iterable");
    const updateFn = (event) => {
      switch (event.type) {
        case "replace":
          return this.items.replace(anchor, event.items);
        case "replaceKeys":
          return this.items.replaceKeys(anchor, event.items);
        case "append":
          return this.items.append(anchor, event.items);
        case "remove":
          return this.items.remove(event.items);
        default:
          return console.warn("Unsupported event type", event);
      }
    };
    return toReactiveNode(anchor, [{
      mount: (parentNode) => parentNode.appendChild(anchor),
      activate: () => this.it$.subscribeInit(this.id, updateFn),
      deactivate: () => {
        this.it$.unsubscribe(this.id);
        this.items.deactivate();
      },
      unmount: () => {
        this.items.unmount();
        anchor.remove();
      }
    }]);
  }
  toEventObservable(it$) {
    return mapObservable((source) => {
      if (source instanceof Array || source instanceof Map) {
        return { type: "replace", items: source };
      }
      return source;
    }, it$);
  }
}
// src/nodes/template.ts
var template = (strings, ...holes) => new Template(strings, holes).toReactiveNode();

class Template {
  strings;
  holes;
  constructor(strings, holes) {
    this.strings = strings;
    this.holes = holes;
  }
  toReactiveNode() {
    const nodes = this.buildNodes();
    const commentNode = document.createComment("Template");
    return toReactiveNode(commentNode, [{
      mount: (parentNode) => this.appendNodes(parentNode, nodes),
      activate: () => {
        for (const node of nodes)
          this.attachObservable(node);
      },
      deactivate: () => {
        for (const node of nodes)
          this.detachObservable(node);
      },
      unmount: () => this.removeNodes(nodes)
    }]);
  }
  buildNodes() {
    return this.strings.map((staticPart, i) => {
      const hole = this.holes[i];
      const partialTextNode = {
        staticNodes: [document.createTextNode(staticPart)],
        dynamicNode: undefined
      };
      if (typeof hole === "string") {
        partialTextNode.staticNodes.push(document.createTextNode(hole));
      } else if (typeof hole === "object" && hole !== null) {
        partialTextNode.dynamicNode = {
          node: document.createTextNode(""),
          observerId: Symbol(`Template${i}`),
          observable: hole
        };
      }
      return partialTextNode;
    });
  }
  appendNodes(parentNode, nodes) {
    for (const { staticNodes, dynamicNode } of nodes) {
      for (const staticNode of staticNodes)
        parentNode.appendChild(staticNode);
      if (dynamicNode !== undefined)
        parentNode.appendChild(dynamicNode.node);
    }
  }
  attachObservable(partialTextNode) {
    if (partialTextNode === undefined)
      return;
    if (partialTextNode.dynamicNode === undefined)
      return;
    const { node, observerId, observable: observable2 } = partialTextNode.dynamicNode;
    observable2.subscribeInit(observerId, (value2) => node.data = value2);
  }
  removeNodes(nodes) {
    for (const { staticNodes, dynamicNode } of nodes) {
      for (const staticNode of staticNodes)
        staticNode.remove();
      if (dynamicNode !== undefined)
        dynamicNode.node.remove();
    }
  }
  detachObservable(node) {
    if (node.dynamicNode === undefined)
      return;
    const { observerId, observable: observable2 } = node.dynamicNode;
    observable2.unsubscribe(observerId);
  }
}
// src/nodes/tag.ts
var tag = (name, ...inputChildren) => {
  const node = document.createElement(name);
  const children = [];
  for (const child of inputChildren) {
    if (typeof child === "string") {
      children.push(reactiveTextNode(child));
    } else if (child instanceof Node) {
      children.push(child);
    } else {
      throw new Error("Unsupported child type");
    }
  }
  return toTagReactiveNode(node, [{
    mount: (parentNode) => {
      parentNode.appendChild(node);
      for (const child of children)
        child.mount(node);
    },
    activate: () => {
      for (const child of children)
        child.activate();
    },
    deactivate: () => {
      for (const child of children)
        child.deactivate();
    },
    unmount: () => {
      for (const child of children)
        child.unmount();
      node.remove();
    }
  }]);
};
var tags = {
  img: (src) => tag("img").att("src", src),
  input: (type) => tag("input").att("type", type),
  canvas: (...children) => tag("canvas", ...children),
  button: (...children) => tag("button", ...children),
  h1: (...children) => tag("h1", ...children),
  h2: (...children) => tag("h2", ...children),
  h3: (...children) => tag("h3", ...children),
  p: (...children) => tag("p", ...children),
  a: (...children) => tag("a", ...children),
  div: (...children) => tag("div", ...children),
  ul: (...children) => tag("ul", ...children),
  li: (...children) => tag("li", ...children),
  span: (...children) => tag("span", ...children),
  select: (...children) => tag("select", ...children),
  option: (...children) => tag("option", ...children)
};
// src/task.ts
var buildMicrotaskRunner = () => {
  const tasks = [];
  const enqueue = () => queueMicrotask(() => {
    const run = tasks.toReversed();
    tasks.length = 0;
    for (const task of run)
      task();
  });
  return (task) => {
    tasks.push(task);
    if (tasks.length == 1)
      enqueue();
  };
};
var microtaskRunner = buildMicrotaskRunner();

// src/router.ts
var router = (routes, opts) => new Router(routes, opts).toReactiveNode();

class Router {
  routes;
  opts;
  anchor;
  currentRoute;
  hashChangeListener = () => this.syncHash();
  constructor(routes, opts) {
    this.routes = routes;
    this.opts = opts;
  }
  toReactiveNode() {
    const anchor = document.createComment("Router");
    return toReactiveNode(anchor, [{
      mount: (parentNode) => {
        if (this.anchor !== undefined)
          return console.warn("Router is already active");
        this.anchor = anchor;
        parentNode.appendChild(anchor);
      },
      activate: () => {
        this.syncHash();
        window.addEventListener("hashchange", this.hashChangeListener);
      },
      deactivate: () => {
        window.removeEventListener("hashchange", this.hashChangeListener);
        this.currentRoute?.deactivate();
      },
      unmount: () => {
        this.currentRoute?.unmount();
        this.currentRoute = undefined;
        anchor.remove();
      }
    }]);
  }
  syncHash() {
    const newRoute = this.getNewRoute();
    if (newRoute === this.currentRoute || newRoute === undefined)
      return;
    this.currentRoute?.deactivate();
    this.currentRoute?.unmount();
    this.currentRoute = newRoute;
    microtaskRunner(() => {
      const parentElement = this.anchor?.parentElement;
      if (parentElement === null || parentElement === undefined)
        return;
      newRoute.mount(parentElement);
      newRoute.activate();
    });
  }
  getNewRoute() {
    const hashLocation = location.hash.slice(1) || "/";
    const routeKey = this.isRouteKey(hashLocation) ? hashLocation : this.opts.notFoundRoute;
    return this.routes[routeKey];
  }
  isRouteKey(key) {
    return key in this.routes;
  }
}
// src/example.ts
var LOREM = `
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
      Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
      Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;
var { a, p, h1, h2, div, span, button, ul, li, img, input: input2 } = tags;
var shoppingItems = new ReactiveArray([
  { name: "milk", price$: observable("1.99") },
  { name: "sour cream", price$: observable("2.99") },
  { name: "cheese", price$: observable("0.99") }
]);
var counter = () => component({
  cache: true,
  props: { counter: "Counter" },
  observables: () => ({
    count$: observable(0),
    hard$: observable(false),
    veryHard$: observable(true)
  }),
  derivedObservables: ({ count$, hard$ }) => ({
    imageSource$: mapObservable((hard) => hard ? "KashaHard.gif" : "Kasha.png", dedupObservable(hard$)),
    hexCounter$: mapObservable((x) => x.toString(16), count$)
  }),
  render: function({ count$, hard$, veryHard$, imageSource$, hexCounter$ }) {
    const onClick = () => {
      count$.update((count) => count + 1);
      hard$.update((hard) => !hard);
    };
    return div(h2(cond({
      if$: mapObservable((hard, veryHard) => hard && veryHard, hard$, veryHard$),
      then: "Rock hard, baby",
      otherwise: "Wood needed"
    })), div(span(template`${this.props.counter}: ${hexCounter$}`)), div(img("Kasha.png").att$("src", imageSource$).clk(onClick)));
  }
});
var shoppingForm = () => component({
  observables: () => ({
    name$: observable(""),
    price$: observable("")
  }),
  derivedObservables: ({ name$, price$ }) => ({
    formInvalid$: mapObservable((name, price) => !!!name || !!!price, name$, price$)
  }),
  render: ({ name$, price$, formInvalid$ }) => div(cond({
    if$: formInvalid$,
    otherwise: () => div(tag("h4", template`Pending item: ${name$} : ${price$}`))
  }), div(span("Name: "), input2("text").att("id", "itemName").model$(name$)), div(span("Price: "), input2("text").att("id", "itemPrice").model$(price$)), button(span("Add")).prop$("disabled", formInvalid$).clk(() => {
    once((name, price) => {
      shoppingItems.push({ name, price$: observable(price) });
      name$.update((_) => "");
      price$.update((_) => "");
    }, name$, price$);
  }))
});
var shoppingList = () => component({
  observables: () => ({ shoppingItems$: shoppingItems.observable$ }),
  render: ({ shoppingItems$ }) => div(h2("Shopping items"), ul(iterable({
    it$: shoppingItems$,
    buildFn: (_, item2) => li(span(template`${item2.name} - ${item2.price$}`)),
    keyFn: (_, item2) => item2.name
  })))
});
var exampleRouter = router({
  "/": div(h1("Reactive"), div(a("Foo").att("href", "#/foo")), div(a("Bar").att("href", "#/bar")), counter(), shoppingList(), shoppingForm()),
  "/foo": component({
    observables: () => ({ count$: observable(0) }),
    derivedObservables: ({ count$ }) => ({
      paragraphStyle$: mapObservable((count) => `color: ${numberToHexColor(count * 999999)}`, count$)
    }),
    render: ({ count$, paragraphStyle$ }) => div(h1("Foo"), p(LOREM).att$("style", paragraphStyle$), button("Change color").clk(() => count$.update((x) => x + 1)), div(a("Home").att("href", "#")))
  }),
  "/bar": div(h1("Bar"), p(LOREM), div(a("Home").att("href", "#")))
}, { notFoundRoute: "/" });
function numberToHexColor(number) {
  let hex = (number % 16777215).toString(16);
  while (hex.length < 6)
    hex = "0" + hex;
  return "#" + hex;
}
exampleRouter.mount(document.body);
exampleRouter.activate();

//# debugId=D557E8DF43590E7264756E2164756E21
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL29ic2VydmFibGVzL25vdGlmaWVyLnRzIiwgInNyYy9yaW5nLnF1ZXVlLnRzIiwgInNyYy9vYnNlcnZhYmxlcy9zY2hlZHVsZXIudHMiLCAic3JjL29ic2VydmFibGVzL21hcC5vYnNlcnZhYmxlL3N0YXRlLnRzIiwgInNyYy9vYnNlcnZhYmxlcy9tYXAub2JzZXJ2YWJsZS9pbmRleC50cyIsICJzcmMvb2JzZXJ2YWJsZXMvdmFsdWUub2JzZXJ2YWJsZS50cyIsICJzcmMvb2JzZXJ2YWJsZXMvZGVkdXAub2JzZXJ2YWJsZS50cyIsICJzcmMvb2JzZXJ2YWJsZXMvc2NvcGVkLm9ic2VydmFibGUudHMiLCAic3JjL29ic2VydmFibGVzL2lucHV0Lm9ic2VydmFibGUudHMiLCAic3JjL29ic2VydmFibGVzL2luZGV4LnRzIiwgInNyYy9yZWFjdGl2ZS9saWZlY3ljbGUudHMiLCAic3JjL3JlYWN0aXZlL2V4dGVuc2lvbnMudHMiLCAic3JjL25vZGVzL2NvbXBvbmVudC50cyIsICJzcmMvcmVhY3RpdmUvYXJyYXkudHMiLCAic3JjL25vZGVzL3JlYWN0aXZlLnRzIiwgInNyYy9ub2Rlcy9jb25kLnRzIiwgInNyYy9ub2Rlcy9pdGVyYWJsZS9pdGVtLnRzIiwgInNyYy9ub2Rlcy9pdGVyYWJsZS9jb2xsZWN0aW9uLnRzIiwgInNyYy9ub2Rlcy9pdGVyYWJsZS50cyIsICJzcmMvbm9kZXMvdGVtcGxhdGUudHMiLCAic3JjL25vZGVzL3RhZy50cyIsICJzcmMvdGFzay50cyIsICJzcmMvcm91dGVyLnRzIiwgInNyYy9leGFtcGxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWwogICAgImltcG9ydCB0eXBlIHsgT2JzZXJ2ZXIgfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgTm90aWZpZXI8VD4ge1xuICAgIHByaXZhdGUgb2JzZXJ2ZXJzID0gbmV3IE1hcDxzeW1ib2wsIE9ic2VydmVyPFQ+PigpO1xuICAgIHByaXZhdGUgbm90aWZ5QWxsID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBub3RpZnlTY2hlZHVsZSA9IG5ldyBTZXQ8c3ltYm9sPigpO1xuXG4gICAgZ2V0IHNpemUoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMub2JzZXJ2ZXJzLnNpemU7XG4gICAgfVxuXG4gICAgc2NoZWR1bGVOb3RpZnkoaWQ6IHN5bWJvbCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMubm90aWZ5QWxsKVxuICAgICAgICAgICAgdGhpcy5ub3RpZnlTY2hlZHVsZS5hZGQoaWQpO1xuICAgIH1cblxuICAgIHNjaGVkdWxlTm90aWZ5QWxsKCk6IHZvaWQge1xuICAgICAgICB0aGlzLm5vdGlmeVNjaGVkdWxlLmNsZWFyKCk7XG4gICAgICAgIHRoaXMubm90aWZ5QWxsID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBjbGVhclNjaGVkdWxlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLm5vdGlmeUFsbCA9IGZhbHNlO1xuICAgICAgICB0aGlzLm5vdGlmeVNjaGVkdWxlLmNsZWFyKCk7XG4gICAgfVxuXG4gICAgY2xlYXIoKTogdm9pZCB7XG4gICAgICAgIHRoaXMub2JzZXJ2ZXJzLmNsZWFyKCk7XG4gICAgfVxuXG4gICAgc2V0KGlkOiBzeW1ib2wsIG9ic2VydmVyOiBPYnNlcnZlcjxUPik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5vYnNlcnZlcnMuaGFzKGlkKSlcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIkR1cGxpY2F0ZSBvYnNlcnZlciBpZFwiLCBpZCk7XG4gICAgICAgIHRoaXMub2JzZXJ2ZXJzLnNldChpZCwgb2JzZXJ2ZXIpO1xuICAgIH1cblxuICAgIGRlbGV0ZShpZDogc3ltYm9sKTogdm9pZCB7XG4gICAgICAgIHRoaXMub2JzZXJ2ZXJzLmRlbGV0ZShpZCk7XG4gICAgfVxuXG4gICAgbm90aWZ5VGFyZ2V0cyh2YWx1ZTogVCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5ub3RpZnlBbGwpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qgb2JzZXJ2ZXIgb2YgdGhpcy5vYnNlcnZlcnMudmFsdWVzKCkpXG4gICAgICAgICAgICAgICAgdGhpcy5ub3RpZnkob2JzZXJ2ZXIsIHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaWQgb2YgdGhpcy5ub3RpZnlTY2hlZHVsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMubm90aWZ5KHRoaXMub2JzZXJ2ZXJzLmdldChpZCksIHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlc2V0VGFyZ2V0cygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ub3RpZnlBbGwgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5ub3RpZnlTY2hlZHVsZS5jbGVhcigpO1xuICAgIH1cblxuICAgIHByaXZhdGUgbm90aWZ5KG9ic2VydmVyOiBPYnNlcnZlcjxUPiB8IHVuZGVmaW5lZCwgdmFsdWU6IFQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChvYnNlcnZlciAhPT0gdW5kZWZpbmVkKSBvYnNlcnZlcih2YWx1ZSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLAogICAgImV4cG9ydCBjbGFzcyBSaW5nUXVldWU8VD4ge1xuICAgIHByaXZhdGUgc2l6ZSA9IDA7XG4gICAgcHJpdmF0ZSBoZWFkID0gMDtcbiAgICBwcml2YXRlIHRhaWwgPSAwO1xuICAgIHByaXZhdGUgaXRlbXM6IEFycmF5PFQgfCB1bmRlZmluZWQ+O1xuXG4gICAgY29uc3RydWN0b3IoY2FwYWNpdHk6IG51bWJlciA9IDI1Nikge1xuICAgICAgICB0aGlzLml0ZW1zID0gbmV3IEFycmF5KGNhcGFjaXR5KTtcbiAgICB9XG5cbiAgICBnZXQgaXNFbXB0eSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2l6ZSA9PT0gMDtcbiAgICB9XG5cbiAgICBjbGVhcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zaXplID0gMDtcbiAgICAgICAgdGhpcy50YWlsID0gMDtcbiAgICAgICAgdGhpcy5oZWFkID0gMDtcbiAgICB9XG5cbiAgICBlbnF1ZXVlKGl0ZW06IFQpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2l6ZSA9PT0gdGhpcy5pdGVtcy5sZW5ndGgpIHRoaXMuZXh0ZW5kKCk7XG5cbiAgICAgICAgdGhpcy5pdGVtc1t0aGlzLnRhaWxdID0gaXRlbTtcbiAgICAgICAgdGhpcy50YWlsID0gKHRoaXMudGFpbCArIDEpICUgdGhpcy5pdGVtcy5sZW5ndGg7XG4gICAgICAgIHRoaXMuc2l6ZSsrO1xuICAgIH1cblxuICAgIGRlcXVldWUoKTogVCB8IHVuZGVmaW5lZCB7XG4gICAgICAgIGlmICh0aGlzLnNpemUgPT09IDApIHJldHVybjtcblxuICAgICAgICBjb25zdCBpdGVtID0gdGhpcy5pdGVtc1t0aGlzLmhlYWRdO1xuICAgICAgICB0aGlzLml0ZW1zW3RoaXMuaGVhZF0gPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuaGVhZCA9ICh0aGlzLmhlYWQgKyAxKSAlIHRoaXMuaXRlbXMubGVuZ3RoO1xuICAgICAgICB0aGlzLnNpemUtLTtcblxuICAgICAgICByZXR1cm4gaXRlbTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4dGVuZCgpIHtcbiAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBuZXcgQXJyYXkodGhpcy5zaXplICogMik7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc2l6ZTsgaSsrKSBcbiAgICAgICAgICAgIG5ld0l0ZW1zW2ldID0gdGhpcy5pdGVtc1sodGhpcy5oZWFkICsgaSkgJSB0aGlzLml0ZW1zLmxlbmd0aF07XG5cbiAgICAgICAgdGhpcy5pdGVtcyA9IG5ld0l0ZW1zO1xuICAgICAgICB0aGlzLmhlYWQgPSAwO1xuICAgICAgICB0aGlzLnRhaWwgPSB0aGlzLnNpemU7XG4gICAgfVxufVxuIiwKICAgICJpbXBvcnQgeyBSaW5nUXVldWUgfSBmcm9tIFwiLi4vcmluZy5xdWV1ZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjaGVkdWxhYmxlIHtcbiAgICBydW4oKTogdm9pZDtcbn1cblxuZXhwb3J0IHR5cGUgU2NoZWR1bGVyID0ge1xuICAgIGVucXVldWVTdWJzY3JpcHRpb246ICh0YXNrOiBTY2hlZHVsYWJsZSkgPT4gdm9pZDtcbiAgICBlbnF1ZXVlVXBkYXRlOiAodGFzazogU2NoZWR1bGFibGUpID0+IHZvaWQ7XG59XG5cbmVudW0gU3RhdHVzIHtcbiAgICBTY2hlZHVsZWQsXG4gICAgSWRsZVxufVxuXG5jb25zdCBidWlsZFNjaGVkdWxlRnVuID0gKCkgPT4ge1xuICAgIGNvbnN0IGZsdXNoSWRzOiBXZWFrTWFwPFNjaGVkdWxhYmxlLCBudW1iZXI+ID0gbmV3IFdlYWtNYXAoKTtcblxuICAgIGxldCBmbHVzaElkID0gMDtcbiAgICBsZXQgc3RhdHVzID0gU3RhdHVzLklkbGU7XG5cbiAgICBsZXQgdGFza3M6IFJpbmdRdWV1ZTxTY2hlZHVsYWJsZT4gPSBuZXcgUmluZ1F1ZXVlKCk7XG4gICAgbGV0IG5leHRUYXNrczogUmluZ1F1ZXVlPFNjaGVkdWxhYmxlPiA9IG5ldyBSaW5nUXVldWUoKTtcblxuICAgIGNvbnN0IHJ1bm5lciA9ICgpID0+IHtcbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIFt0YXNrcywgbmV4dFRhc2tzXSA9IFtuZXh0VGFza3MsIHRhc2tzXTtcbiAgICAgICAgICAgIG5leHRUYXNrcy5jbGVhcigpO1xuXG4gICAgICAgICAgICBsZXQgdGFzazogU2NoZWR1bGFibGUgfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICB3aGlsZSAodGFzayA9IHRhc2tzLmRlcXVldWUoKSkgdGFzay5ydW4oKTtcblxuICAgICAgICAgICAgaWYgKG5leHRUYXNrcy5pc0VtcHR5KSBicmVhaztcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCBlbnF1ZXVlTWljcm90YXNrID0gKCkgPT4gcXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuICAgICAgICBydW5uZXIoKTtcbiAgICAgICAgc3RhdHVzID0gU3RhdHVzLklkbGU7XG4gICAgICAgIGZsdXNoSWQrKztcbiAgICB9KTtcblxuICAgIHJldHVybiAodGFzazogU2NoZWR1bGFibGUpID0+IHtcbiAgICAgICAgY29uc3QgdGFza0ZsdXNoSWQgPSBmbHVzaElkcy5nZXQodGFzayk7XG4gICAgICAgIGlmICh0YXNrRmx1c2hJZCA9PT0gZmx1c2hJZCkgcmV0dXJuO1xuXG4gICAgICAgIGZsdXNoSWRzLnNldCh0YXNrLCBmbHVzaElkKTtcbiAgICAgICAgbmV4dFRhc2tzLmVucXVldWUodGFzayk7XG5cbiAgICAgICAgaWYgKHN0YXR1cyA9PT0gU3RhdHVzLlNjaGVkdWxlZCkgcmV0dXJuO1xuXG4gICAgICAgIHN0YXR1cyA9IFN0YXR1cy5TY2hlZHVsZWQ7XG4gICAgICAgIGVucXVldWVNaWNyb3Rhc2soKTtcbiAgICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IHNjaGVkdWxlcjogU2NoZWR1bGVyID0ge1xuICAgIGVucXVldWVTdWJzY3JpcHRpb246IGJ1aWxkU2NoZWR1bGVGdW4oKSxcbiAgICBlbnF1ZXVlVXBkYXRlOiBidWlsZFNjaGVkdWxlRnVuKClcbn07XG4iLAogICAgImltcG9ydCB0eXBlIHsgT2JzZXJ2YWJsZSwgVmFsdWVzIH0gZnJvbSBcIi4uXCI7XG5cbmV4cG9ydCB0eXBlIFN0YXRlPE8gZXh0ZW5kcyByZWFkb25seSBPYnNlcnZhYmxlPGFueT5bXT4gPVxuICAgIEluaXRpYWxpemVkPE8+IHwgVW5pbml0aWFsaXplZDxPPjtcblxudHlwZSBQYXJ0aWFsQXJyYXk8ViBleHRlbmRzIHJlYWRvbmx5IGFueVtdPiA9IHtcbiAgICBbSyBpbiBrZXlvZiBWXT86IFZbS107XG59O1xuXG5leHBvcnQgY2xhc3MgSW5pdGlhbGl6ZWQ8TyBleHRlbmRzIHJlYWRvbmx5IE9ic2VydmFibGU8YW55PltdPiB7XG4gICAgY29uc3RydWN0b3IocHVibGljIHZhbHVlczogVmFsdWVzPE8+KSB7IH1cblxuICAgIHB1YmxpYyB1cGRhdGU8SyBleHRlbmRzIGtleW9mIE8+KGk6IEssIHZhbHVlOiBWYWx1ZXM8Tz5bS10pOiBJbml0aWFsaXplZDxPPiB7XG4gICAgICAgIHRoaXMudmFsdWVzW2ldID0gdmFsdWU7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIFVuaW5pdGlhbGl6ZWQ8TyBleHRlbmRzIHJlYWRvbmx5IE9ic2VydmFibGU8YW55PltdPiB7XG4gICAgcHJpdmF0ZSBpbml0aWFsaXplZEluZGljZXMgPSBuZXcgU2V0KCk7XG4gICAgcHVibGljIHZhbHVlczogUGFydGlhbEFycmF5PFZhbHVlczxPPj47XG5cbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGluaXRpYWxpemVkU2l6ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMudmFsdWVzID0gbmV3IEFycmF5KGluaXRpYWxpemVkU2l6ZSkuZmlsbCh1bmRlZmluZWQpIGFzIFBhcnRpYWxBcnJheTxWYWx1ZXM8Tz4+O1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGU8SyBleHRlbmRzIGtleW9mIE8+KGk6IEssIHZhbHVlOiBWYWx1ZXM8Tz5bS10pOiBVbmluaXRpYWxpemVkPE8+IHwgSW5pdGlhbGl6ZWQ8Tz4ge1xuICAgICAgICB0aGlzLmluaXRpYWxpemVkSW5kaWNlcy5hZGQoaSk7XG4gICAgICAgIHRoaXMudmFsdWVzW2ldID0gdmFsdWU7XG5cbiAgICAgICAgaWYgKHRoaXMuaW5pdGlhbGl6ZWRJbmRpY2VzLnNpemUgPT09IHRoaXMuaW5pdGlhbGl6ZWRTaXplKVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBJbml0aWFsaXplZCh0aGlzLnZhbHVlcyBhcyBWYWx1ZXM8Tz4pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59XG4iLAogICAgImltcG9ydCB0eXBlIHsgT2JzZXJ2YWJsZSwgT2JzZXJ2ZXIsIFZhbHVlcyB9IGZyb20gXCIuLlwiO1xuaW1wb3J0IHsgTm90aWZpZXIgfSBmcm9tIFwiLi4vbm90aWZpZXJcIjtcbmltcG9ydCB7IHNjaGVkdWxlciwgdHlwZSBTY2hlZHVsYWJsZSB9IGZyb20gXCIuLi9zY2hlZHVsZXJcIjtcbmltcG9ydCB7IHR5cGUgU3RhdGUsIFVuaW5pdGlhbGl6ZWQgfSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG5leHBvcnQgY29uc3QgbWFwT2JzZXJ2YWJsZSA9IDxcbiAgICBPYnNlcnZhYmxlcyBleHRlbmRzIHJlYWRvbmx5IE9ic2VydmFibGU8YW55PltdLFxuICAgIFJcbj4oXG4gICAgbWFwRm46ICguLi52YWx1ZXM6IFZhbHVlczxPYnNlcnZhYmxlcz4pID0+IFIsXG4gICAgLi4ub2JzZXJ2YWJsZXM6IE9ic2VydmFibGVzXG4pOiBNYXBPYnNlcnZhYmxlPE9ic2VydmFibGVzLCBSPiA9PlxuICAgIG5ldyBNYXBPYnNlcnZhYmxlKG1hcEZuLCBvYnNlcnZhYmxlcyk7XG5cbmNsYXNzIE1hcE9ic2VydmFibGU8XG4gICAgT2JzZXJ2YWJsZXMgZXh0ZW5kcyByZWFkb25seSBPYnNlcnZhYmxlPGFueT5bXSxcbiAgICBSXG4+IGltcGxlbWVudHMgT2JzZXJ2YWJsZTxSPiwgU2NoZWR1bGFibGUge1xuICAgIHByaXZhdGUgbm90aWZpZXIgPSBuZXcgTm90aWZpZXI8Uj4oKTtcbiAgICBwcml2YXRlIHN0YXRlOiBTdGF0ZTxPYnNlcnZhYmxlcz47XG4gICAgcHJpdmF0ZSBpZHM6IHN5bWJvbFtdO1xuXG4gICAgY29uc3RydWN0b3IoXG4gICAgICAgIHByaXZhdGUgbWFwRm46ICguLi52YWx1ZXM6IFZhbHVlczxPYnNlcnZhYmxlcz4pID0+IFIsXG4gICAgICAgIHByaXZhdGUgb2JzZXJ2YWJsZXM6IE9ic2VydmFibGVzXG4gICAgKSB7XG4gICAgICAgIHRoaXMuaWRzID0gQXJyYXkuZnJvbSh0aGlzLm9ic2VydmFibGVzLCAoKSA9PiBTeW1ib2woXCJNYXBPYnNlcnZhYmxlXCIpKTtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IG5ldyBVbmluaXRpYWxpemVkKHRoaXMuaWRzLmxlbmd0aClcbiAgICB9XG5cbiAgICB1bnN1YnNjcmliZUFsbCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ub3RpZmllci5jbGVhcigpO1xuICAgICAgICB0aGlzLmlubmVyVW51YnNjcmliZSgpO1xuICAgIH1cblxuICAgIHVuc3Vic2NyaWJlKGlkOiBzeW1ib2wpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ub3RpZmllci5kZWxldGUoaWQpO1xuICAgICAgICB0aGlzLmlubmVyVW51YnNjcmliZSgpO1xuICAgIH1cblxuICAgIHN1YnNjcmliZShpZDogc3ltYm9sLCBvYnNlcnZlcjogT2JzZXJ2ZXI8Uj4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ub3RpZmllci5zZXQoaWQsIG9ic2VydmVyKTtcbiAgICAgICAgdGhpcy5pbm5lclN1YnNjcmliZSgpO1xuICAgIH1cblxuICAgIHN1YnNjcmliZUluaXQoaWQ6IHN5bWJvbCwgb2JzZXJ2ZXI6IE9ic2VydmVyPFI+KTogdm9pZCB7XG4gICAgICAgIHRoaXMuc3Vic2NyaWJlKGlkLCBvYnNlcnZlcik7XG4gICAgICAgIHRoaXMubm90aWZpZXIuc2NoZWR1bGVOb3RpZnkoaWQpO1xuICAgICAgICBzY2hlZHVsZXIuZW5xdWV1ZVN1YnNjcmlwdGlvbih0aGlzKTtcbiAgICB9XG5cbiAgICBydW4oKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlIGluc3RhbmNlb2YgVW5pbml0aWFsaXplZCkgcmV0dXJuO1xuICAgICAgICB0aGlzLm5vdGlmaWVyLm5vdGlmeVRhcmdldHModGhpcy5tYXBGbiguLi50aGlzLnN0YXRlLnZhbHVlcykpO1xuICAgICAgICB0aGlzLm5vdGlmaWVyLnJlc2V0VGFyZ2V0cygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgbm90aWZ5T2JzZXJ2ZXJzKGk6IGtleW9mIE9ic2VydmFibGVzKSB7XG4gICAgICAgIHJldHVybiAobmV3VmFsdWU6IFZhbHVlczxPYnNlcnZhYmxlcz5ba2V5b2YgT2JzZXJ2YWJsZXNdKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gdGhpcy5zdGF0ZS51cGRhdGUoaSwgbmV3VmFsdWUpO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RhdGUgaW5zdGFuY2VvZiBVbmluaXRpYWxpemVkKSByZXR1cm47XG4gICAgICAgICAgICB0aGlzLm5vdGlmaWVyLnNjaGVkdWxlTm90aWZ5QWxsKCk7XG4gICAgICAgICAgICBzY2hlZHVsZXIuZW5xdWV1ZVVwZGF0ZSh0aGlzKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGlubmVyU3Vic2NyaWJlKCkge1xuICAgICAgICBpZiAodGhpcy5ub3RpZmllci5zaXplICE9PSAxKSByZXR1cm47XG4gICAgICAgIGZvciAoY29uc3QgW2ksIG9ic2VydmFibGVdIG9mIHRoaXMub2JzZXJ2YWJsZXMuZW50cmllcygpKVxuICAgICAgICAgICAgaWYgKHRoaXMuaWRzW2ldICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgb2JzZXJ2YWJsZS5zdWJzY3JpYmVJbml0KHRoaXMuaWRzW2ldLCB0aGlzLm5vdGlmeU9ic2VydmVycyhpKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpbm5lclVudWJzY3JpYmUoKSB7XG4gICAgICAgIGlmICh0aGlzLm5vdGlmaWVyLnNpemUgIT09IDApIHJldHVybjtcbiAgICAgICAgZm9yIChjb25zdCBbaSwgb2JzZXJ2YWJsZV0gb2YgdGhpcy5vYnNlcnZhYmxlcy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmlkc1tpXSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgIG9ic2VydmFibGUudW5zdWJzY3JpYmUodGhpcy5pZHNbaV0pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc3RhdGUgPSBuZXcgVW5pbml0aWFsaXplZCh0aGlzLmlkcy5sZW5ndGgpO1xuICAgIH1cbn1cbiIsCiAgICAiaW1wb3J0IHR5cGUgeyBPYnNlcnZhYmxlLCBPYnNlcnZlciwgVXBkYXRhYmxlLCBVcGRhdGVGbiB9IGZyb20gXCIuXCI7XG5pbXBvcnQgeyBOb3RpZmllciB9IGZyb20gXCIuL25vdGlmaWVyXCI7XG5pbXBvcnQgeyBzY2hlZHVsZXIsIHR5cGUgU2NoZWR1bGFibGUgfSBmcm9tIFwiLi9zY2hlZHVsZXJcIjtcblxuZXhwb3J0IGNvbnN0IG9ic2VydmFibGUgPSA8VD4oXG4gICAgdmFsdWU6IFRcbik6IFZhbHVlT2JzZXJ2YWJsZTxUPiA9PiBuZXcgVmFsdWVPYnNlcnZhYmxlKHZhbHVlKTtcblxuY2xhc3MgVmFsdWVPYnNlcnZhYmxlPFQ+IGltcGxlbWVudHMgT2JzZXJ2YWJsZTxUPiwgVXBkYXRhYmxlPFQ+LCBTY2hlZHVsYWJsZSB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBub3RpZmllciA9IG5ldyBOb3RpZmllcjxUPigpO1xuXG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSB2YWx1ZTogVCkgeyB9XG5cbiAgICB1bnN1YnNjcmliZUFsbCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ub3RpZmllci5jbGVhcigpO1xuICAgIH1cblxuICAgIHVuc3Vic2NyaWJlKGlkOiBzeW1ib2wpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ub3RpZmllci5kZWxldGUoaWQpO1xuICAgIH1cblxuICAgIHN1YnNjcmliZShpZDogc3ltYm9sLCBvYnNlcnZlcjogT2JzZXJ2ZXI8VD4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ub3RpZmllci5zZXQoaWQsIG9ic2VydmVyKTtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmVJbml0KGlkOiBzeW1ib2wsIG9ic2VydmVyOiBPYnNlcnZlcjxUPik6IHZvaWQge1xuICAgICAgICB0aGlzLm5vdGlmaWVyLnNldChpZCwgb2JzZXJ2ZXIpO1xuICAgICAgICB0aGlzLm5vdGlmaWVyLnNjaGVkdWxlTm90aWZ5KGlkKTtcbiAgICAgICAgc2NoZWR1bGVyLmVucXVldWVTdWJzY3JpcHRpb24odGhpcyk7XG4gICAgfVxuXG4gICAgdXBkYXRlKHVwZGF0ZUZuOiBVcGRhdGVGbjxUPik6IHZvaWQge1xuICAgICAgICB0aGlzLnZhbHVlID0gdXBkYXRlRm4odGhpcy52YWx1ZSk7XG4gICAgICAgIHRoaXMubm90aWZpZXIuc2NoZWR1bGVOb3RpZnlBbGwoKTtcbiAgICAgICAgc2NoZWR1bGVyLmVucXVldWVVcGRhdGUodGhpcyk7XG4gICAgfVxuXG4gICAgcnVuKCk6IHZvaWQge1xuICAgICAgICB0aGlzLm5vdGlmaWVyLm5vdGlmeVRhcmdldHModGhpcy52YWx1ZSk7XG4gICAgICAgIHRoaXMubm90aWZpZXIucmVzZXRUYXJnZXRzKCk7XG4gICAgfVxufVxuXG4iLAogICAgImltcG9ydCB0eXBlIHsgT2JzZXJ2YWJsZSwgT2JzZXJ2ZXIgfSBmcm9tIFwiLlwiO1xuaW1wb3J0IHsgTm90aWZpZXIgfSBmcm9tIFwiLi9ub3RpZmllclwiO1xuaW1wb3J0IHsgc2NoZWR1bGVyLCB0eXBlIFNjaGVkdWxhYmxlIH0gZnJvbSBcIi4vc2NoZWR1bGVyXCI7XG5cbmV4cG9ydCBjb25zdCBkZWR1cE9ic2VydmFibGUgPSA8VD4oXG4gICAgaW5uZXJPYnNlcnZhYmxlOiBPYnNlcnZhYmxlPFQ+LFxuICAgIGNvbXBhcmVFcXVhbEZuOiBDb21wYXJlRXF1YWxGbjxUPiA9IChhLCBiKSA9PiBhID09IGIsXG4gICAgY2xvbmVGbjogQ2xvbmVGbjxUPiA9IChhKSA9PiBhXG4pOiBEZWR1cE9ic2VydmFibGU8VD4gPT4gbmV3IERlZHVwT2JzZXJ2YWJsZShpbm5lck9ic2VydmFibGUsIGNvbXBhcmVFcXVhbEZuLCBjbG9uZUZuKTtcblxudHlwZSBDb21wYXJlRXF1YWxGbjxUPiA9IChhOiBULCBiOiBUKSA9PiBib29sZWFuO1xudHlwZSBDbG9uZUZuPFQ+ID0gKGE6IFQpID0+IFQ7XG50eXBlIFN0YXRlPFQ+ID0geyBpbml0aWFsaXplZDogZmFsc2UgfSB8IHsgaW5pdGlhbGl6ZWQ6IHRydWUsIHZhbHVlOiBUIH07XG5cbmNsYXNzIERlZHVwT2JzZXJ2YWJsZTxUPiBpbXBsZW1lbnRzIE9ic2VydmFibGU8VD4sIFNjaGVkdWxhYmxlIHtcbiAgICBwcml2YXRlIGlkID0gU3ltYm9sKCdEZWR1cE9ic2VydmFibGUnKTtcbiAgICBwcml2YXRlIHN0YXRlOiBTdGF0ZTxUPiA9IHsgaW5pdGlhbGl6ZWQ6IGZhbHNlIH07XG4gICAgcHJpdmF0ZSBib3VuZFVwZGF0ZSA9IHRoaXMudXBkYXRlVmFsdWUuYmluZCh0aGlzKTtcbiAgICBwcml2YXRlIG5vdGlmaWVyID0gbmV3IE5vdGlmaWVyPFQ+KCk7XG5cbiAgICBjb25zdHJ1Y3RvcihcbiAgICAgICAgcHJpdmF0ZSBpbm5lck9ic2VydmFibGU6IE9ic2VydmFibGU8VD4sXG4gICAgICAgIHByaXZhdGUgY29tcGFyZUVxdWFsRm46IENvbXBhcmVFcXVhbEZuPFQ+LFxuICAgICAgICBwcml2YXRlIGNsb25lRm46IENsb25lRm48VD5cbiAgICApIHsgfVxuXG4gICAgdW5zdWJzY3JpYmVBbGwoKTogdm9pZCB7XG4gICAgICAgIHRoaXMubm90aWZpZXIuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5pbm5lclVudWJzY3JpYmUoKTtcbiAgICB9XG5cbiAgICB1bnN1YnNjcmliZShpZDogc3ltYm9sKTogdm9pZCB7XG4gICAgICAgIHRoaXMubm90aWZpZXIuZGVsZXRlKGlkKTtcbiAgICAgICAgdGhpcy5pbm5lclVudWJzY3JpYmUoKTtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmUoaWQ6IHN5bWJvbCwgb2JzZXJ2ZXI6IE9ic2VydmVyPFQ+KTogdm9pZCB7XG4gICAgICAgIHRoaXMubm90aWZpZXIuc2V0KGlkLCBvYnNlcnZlcik7XG4gICAgICAgIHRoaXMuaW5uZXJTdWJzY3JpYmUoKTtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmVJbml0KGlkOiBzeW1ib2wsIG9ic2VydmVyOiBPYnNlcnZlcjxUPik6IHZvaWQge1xuICAgICAgICB0aGlzLnN1YnNjcmliZShpZCwgb2JzZXJ2ZXIpO1xuICAgICAgICB0aGlzLm5vdGlmaWVyLnNjaGVkdWxlTm90aWZ5KGlkKTtcbiAgICAgICAgc2NoZWR1bGVyLmVucXVldWVTdWJzY3JpcHRpb24odGhpcyk7XG4gICAgfVxuXG4gICAgcnVuKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuc3RhdGUuaW5pdGlhbGl6ZWQpIHJldHVybjtcbiAgICAgICAgdGhpcy5ub3RpZmllci5ub3RpZnlUYXJnZXRzKHRoaXMuc3RhdGUudmFsdWUpO1xuICAgICAgICB0aGlzLm5vdGlmaWVyLnJlc2V0VGFyZ2V0cygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgaW5uZXJTdWJzY3JpYmUoKSB7XG4gICAgICAgIGlmICh0aGlzLm5vdGlmaWVyLnNpemUgIT09IDEpIHJldHVybjtcbiAgICAgICAgdGhpcy5pbm5lck9ic2VydmFibGUuc3Vic2NyaWJlSW5pdCh0aGlzLmlkLCB0aGlzLmJvdW5kVXBkYXRlKTtcbiAgICB9O1xuXG4gICAgcHJpdmF0ZSB1cGRhdGVWYWx1ZSh2YWx1ZTogVCkge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZS5pbml0aWFsaXplZCAmJiB0aGlzLmNvbXBhcmVFcXVhbEZuKHRoaXMuc3RhdGUudmFsdWUsIHZhbHVlKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy5zdGF0ZS5pbml0aWFsaXplZClcbiAgICAgICAgICAgIHRoaXMuc3RhdGUudmFsdWUgPSB0aGlzLmNsb25lRm4odmFsdWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0geyBpbml0aWFsaXplZDogdHJ1ZSwgdmFsdWU6IHRoaXMuY2xvbmVGbih2YWx1ZSkgfTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMubm90aWZpZXIuc2NoZWR1bGVOb3RpZnlBbGwoKTtcbiAgICAgICAgc2NoZWR1bGVyLmVucXVldWVVcGRhdGUodGhpcyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpbm5lclVudWJzY3JpYmUoKSB7XG4gICAgICAgIGlmICh0aGlzLm5vdGlmaWVyLnNpemUgIT09IDApIHJldHVybjtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IHsgaW5pdGlhbGl6ZWQ6IGZhbHNlIH07XG4gICAgICAgIHRoaXMuaW5uZXJPYnNlcnZhYmxlLnVuc3Vic2NyaWJlKHRoaXMuaWQpO1xuICAgIH1cbn1cbiIsCiAgICAiaW1wb3J0IHR5cGUgeyBPYnNlcnZhYmxlLCBPYnNlcnZlciwgVXBkYXRhYmxlLCBVcGRhdGVGbiB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjb25zdCBzY29wZWRPYnNlcnZhYmxlID0gPFQgZXh0ZW5kcyBPYnNlcnZhYmxlPGFueT4+KFxuICAgIGlubmVyT2JzZXJ2YWJsZTogVFxuKTogU2NvcGVkT2JzZXJ2YWJsZTxUPiA9PiBuZXcgU2NvcGVkT2JzZXJ2YWJsZTxUPihpbm5lck9ic2VydmFibGUpO1xuXG50eXBlIFZhbHVlPE8gZXh0ZW5kcyBPYnNlcnZhYmxlPGFueT4+ID1cbiAgICBPIGV4dGVuZHMgT2JzZXJ2YWJsZTxpbmZlciBUPiA/IFQgOiBuZXZlcjtcblxuZXhwb3J0IGNsYXNzIFNjb3BlZE9ic2VydmFibGU8VCBleHRlbmRzIE9ic2VydmFibGU8YW55Pj4gaW1wbGVtZW50cyBPYnNlcnZhYmxlPFZhbHVlPFQ+PiB7XG4gICAgcHJpdmF0ZSBhbGlhc2VzID0gbmV3IE1hcDxzeW1ib2wsIHN5bWJvbD4oKTtcblxuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgICBwcml2YXRlIGlubmVyT2JzZXJ2YWJsZTogVFxuICAgICkgeyB9XG5cbiAgICB1bnN1YnNjcmliZUFsbCgpOiB2b2lkIHtcbiAgICAgICAgZm9yIChjb25zdCBhbGlhcyBvZiB0aGlzLmFsaWFzZXMudmFsdWVzKCkpXG4gICAgICAgICAgICB0aGlzLmlubmVyT2JzZXJ2YWJsZS51bnN1YnNjcmliZShhbGlhcyk7XG4gICAgICAgIHRoaXMuYWxpYXNlcy5jbGVhcigpO1xuICAgIH1cblxuICAgIHVuc3Vic2NyaWJlKGlkOiBzeW1ib2wpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYWxpYXMgPSB0aGlzLmFsaWFzZXMuZ2V0KGlkKTtcbiAgICAgICAgaWYgKGFsaWFzID09PSB1bmRlZmluZWQpIHJldHVybjtcbiAgICAgICAgdGhpcy5hbGlhc2VzLmRlbGV0ZShpZCk7XG4gICAgICAgIHRoaXMuaW5uZXJPYnNlcnZhYmxlLnVuc3Vic2NyaWJlKGFsaWFzKTtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmUoaWQ6IHN5bWJvbCwgb2JzZXJ2ZXI6IE9ic2VydmVyPFZhbHVlPFQ+Pik6IHZvaWQge1xuICAgICAgICBjb25zdCBhbGlhcyA9IFN5bWJvbCgnU2NvcGVkT2JzZXJ2YWJsZScpO1xuICAgICAgICB0aGlzLmFsaWFzZXMuc2V0KGlkLCBhbGlhcyk7XG4gICAgICAgIHRoaXMuaW5uZXJPYnNlcnZhYmxlLnN1YnNjcmliZShhbGlhcywgb2JzZXJ2ZXIpO1xuICAgIH1cblxuICAgIHN1YnNjcmliZUluaXQoaWQ6IHN5bWJvbCwgb2JzZXJ2ZXI6IE9ic2VydmVyPFZhbHVlPFQ+Pik6IHZvaWQge1xuICAgICAgICBjb25zdCBhbGlhcyA9IFN5bWJvbCgnU2NvcGVkT2JzZXJ2YWJsZScpO1xuICAgICAgICB0aGlzLmFsaWFzZXMuc2V0KGlkLCBhbGlhcyk7XG4gICAgICAgIHRoaXMuaW5uZXJPYnNlcnZhYmxlLnN1YnNjcmliZUluaXQoYWxpYXMsIG9ic2VydmVyKTtcbiAgICB9XG5cbiAgICB1cGRhdGUoXG4gICAgICAgIHRoaXM6IFNjb3BlZE9ic2VydmFibGU8VXBkYXRhYmxlPFZhbHVlPFQ+PiAmIE9ic2VydmFibGU8VmFsdWU8VD4+PixcbiAgICAgICAgdXBkYXRlRm46IFVwZGF0ZUZuPFZhbHVlPFQ+PlxuICAgICk6IHZvaWQge1xuICAgICAgICBpZiAoJ3VwZGF0ZScgaW4gdGhpcy5pbm5lck9ic2VydmFibGUpXG4gICAgICAgICAgICAodGhpcy5pbm5lck9ic2VydmFibGUgYXMgVXBkYXRhYmxlPFZhbHVlPFQ+PikudXBkYXRlKHVwZGF0ZUZuKTtcbiAgICB9XG59XG4iLAogICAgImltcG9ydCB0eXBlIHsgT2JzZXJ2YWJsZSwgT2JzZXJ2ZXIsIFVwZGF0YWJsZSwgVXBkYXRlRm4gfSBmcm9tIFwiLlwiO1xuaW1wb3J0IHR5cGUgeyBUYWdSZWFjdGl2ZU5vZGUgfSBmcm9tIFwiLi4vcmVhY3RpdmVcIjtcblxuZXhwb3J0IGNvbnN0IGlucHV0T2JzZXJ2YWJsZSA9IDxJIGV4dGVuZHMgJ2lucHV0JyB8ICd0ZXh0YXJlYScgfCAnc2VsZWN0Jz4oXG4gICAgaW5wdXQ6IFRhZ1JlYWN0aXZlTm9kZTxJPixcbiAgICB2YWx1ZSQ6IE9ic2VydmFibGU8c3RyaW5nPiAmIFVwZGF0YWJsZTxzdHJpbmc+XG4pOiBJbnB1dE9ic2VydmFibGU8ST4gPT4gbmV3IElucHV0T2JzZXJ2YWJsZTxJPihpbnB1dCwgdmFsdWUkKTtcblxuXG5leHBvcnQgY2xhc3MgSW5wdXRPYnNlcnZhYmxlPFxuICAgIEkgZXh0ZW5kcyAnaW5wdXQnIHwgJ3RleHRhcmVhJyB8ICdzZWxlY3QnXG4+IGltcGxlbWVudHMgT2JzZXJ2YWJsZTxzdHJpbmc+LCBVcGRhdGFibGU8c3RyaW5nPiB7XG4gICAgcHJpdmF0ZSBhbGlhc2VzID0gbmV3IE1hcDxzeW1ib2wsIHN5bWJvbD4oKTtcblxuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgICBwcml2YXRlIGlucHV0OiBUYWdSZWFjdGl2ZU5vZGU8ST4sXG4gICAgICAgIHByaXZhdGUgdmFsdWUkOiBPYnNlcnZhYmxlPHN0cmluZz4gJiBVcGRhdGFibGU8c3RyaW5nPlxuICAgICkgeyB9XG5cbiAgICBzdWJzY3JpYmUoaWQ6IHN5bWJvbCwgb2JzZXJ2ZXI6IE9ic2VydmVyPHN0cmluZz4pOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuYWxpYXNlcy5oYXMoaWQpKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGFsaWFzID0gU3ltYm9sKCdJbnB1dE9ic2VydmFibGUnKTtcbiAgICAgICAgdGhpcy5hbGlhc2VzLnNldChpZCwgYWxpYXMpO1xuICAgICAgICB0aGlzLnZhbHVlJC5zdWJzY3JpYmUoYWxpYXMsIHRoaXMudG9JbnB1dE9ic2VydmVyKG9ic2VydmVyKSk7XG4gICAgfVxuXG4gICAgc3Vic2NyaWJlSW5pdChpZDogc3ltYm9sLCBvYnNlcnZlcjogT2JzZXJ2ZXI8c3RyaW5nPik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5hbGlhc2VzLmhhcyhpZCkpIHJldHVybjtcbiAgICAgICAgY29uc3QgYWxpYXMgPSBTeW1ib2woJ0lucHV0T2JzZXJ2YWJsZScpO1xuICAgICAgICB0aGlzLmFsaWFzZXMuc2V0KGlkLCBhbGlhcyk7XG4gICAgICAgIHRoaXMudmFsdWUkLnN1YnNjcmliZUluaXQoYWxpYXMsIHRoaXMudG9JbnB1dE9ic2VydmVyKG9ic2VydmVyKSk7XG4gICAgfVxuXG4gICAgdW5zdWJzY3JpYmUoaWQ6IHN5bWJvbCk6IHZvaWQge1xuICAgICAgICBjb25zdCBhbGlhcyA9IHRoaXMuYWxpYXNlcy5nZXQoaWQpO1xuICAgICAgICBpZiAoYWxpYXMgPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xuICAgICAgICB0aGlzLnZhbHVlJC51bnN1YnNjcmliZShhbGlhcyk7XG4gICAgICAgIHRoaXMuYWxpYXNlcy5kZWxldGUoaWQpO1xuICAgIH1cblxuICAgIHVuc3Vic2NyaWJlQWxsKCk6IHZvaWQge1xuICAgICAgICBmb3IgKGNvbnN0IGFsaWFzIG9mIHRoaXMuYWxpYXNlcy52YWx1ZXMoKSlcbiAgICAgICAgICAgIHRoaXMudmFsdWUkLnVuc3Vic2NyaWJlKGFsaWFzKTtcbiAgICAgICAgdGhpcy5hbGlhc2VzLmNsZWFyKCk7XG4gICAgfVxuXG4gICAgdXBkYXRlKHVwZGF0ZUZuOiBVcGRhdGVGbjxzdHJpbmc+KTogdm9pZCB7XG4gICAgICAgIHRoaXMudmFsdWUkLnVwZGF0ZSh1cGRhdGVGbik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0b0lucHV0T2JzZXJ2ZXIob2JzZXJ2ZXI6IE9ic2VydmVyPHN0cmluZz4pIHtcbiAgICAgICAgcmV0dXJuICh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5pbnB1dC52YWx1ZSAhPT0gdmFsdWUpIG9ic2VydmVyKHZhbHVlKTtcbiAgICAgICAgfTtcbiAgICB9XG59XG4iLAogICAgImltcG9ydCB7IG1hcE9ic2VydmFibGUgfSBmcm9tIFwiLi9tYXAub2JzZXJ2YWJsZVwiO1xuXG5leHBvcnQgdHlwZSBPYnNlcnZlcjxUPiA9ICh2YWx1ZTogVCkgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIFVwZGF0ZUZuPFQ+ID0gKHZhbHVlOiBUKSA9PiBUO1xuXG5leHBvcnQgaW50ZXJmYWNlIE9ic2VydmFibGU8VD4ge1xuICAgIHVuc3Vic2NyaWJlQWxsKCk6IHZvaWQ7XG4gICAgdW5zdWJzY3JpYmUoaWQ6IHN5bWJvbCk6IHZvaWQ7XG4gICAgc3Vic2NyaWJlKGlkOiBzeW1ib2wsIG9ic2VydmVyOiBPYnNlcnZlcjxUPik6IHZvaWQ7XG4gICAgc3Vic2NyaWJlSW5pdChpZDogc3ltYm9sLCBvYnNlcnZlcjogT2JzZXJ2ZXI8VD4pOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVwZGF0YWJsZTxUPiB7XG4gICAgdXBkYXRlKHVwZGF0ZUZuOiBVcGRhdGVGbjxUPik6IHZvaWQ7XG59XG5cbmV4cG9ydCB0eXBlIE9ic2VydmFibGVWYWx1ZTxPIGV4dGVuZHMgT2JzZXJ2YWJsZTxhbnk+PiA9XG4gICAgTyBleHRlbmRzIE9ic2VydmFibGU8aW5mZXIgVD4gPyBUIDogbmV2ZXI7XG5cbmV4cG9ydCB0eXBlIFZhbHVlczxcbiAgICBPYnNlcnZhYmxlcyBleHRlbmRzIHJlYWRvbmx5IE9ic2VydmFibGU8YW55PltdXG4+ID0geyBbSyBpbiBrZXlvZiBPYnNlcnZhYmxlc106IE9ic2VydmFibGVWYWx1ZTxPYnNlcnZhYmxlc1tLXT4gfTtcblxuZXhwb3J0IGNvbnN0IG9uY2UgPSA8VCBleHRlbmRzIGFueVtdPihcbiAgICBmbjogKC4uLnZhbHVlczogVCkgPT4gdm9pZCwgXG4gICAgLi4ub2JzZXJ2YWJsZXM6IHsgW0sgaW4ga2V5b2YgVF06IE9ic2VydmFibGU8VFtLXT4gfSk6IHZvaWQgPT4ge1xuICAgIGNvbnN0IGlkID0gU3ltYm9sKCdPbmNlJyk7XG4gICAgY29uc3Qgb2JzZXJ2YWJsZSA9IG1hcE9ic2VydmFibGUoKC4uLnZhbHVlcykgPT4gdmFsdWVzLCAuLi5vYnNlcnZhYmxlcyk7XG4gICAgb2JzZXJ2YWJsZS5zdWJzY3JpYmVJbml0KGlkLCAodmFsdWVzOiBUKSA9PiB7XG4gICAgICAgIG9ic2VydmFibGUudW5zdWJzY3JpYmUoaWQpO1xuICAgICAgICBmbiguLi52YWx1ZXMpO1xuICAgIH0pO1xufTtcblxuZXhwb3J0ICogZnJvbSBcIi4vdmFsdWUub2JzZXJ2YWJsZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vbWFwLm9ic2VydmFibGVcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2RlZHVwLm9ic2VydmFibGVcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3Njb3BlZC5vYnNlcnZhYmxlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9pbnB1dC5vYnNlcnZhYmxlXCI7XG4iLAogICAgImV4cG9ydCBpbnRlcmZhY2UgTGlmZWN5Y2xlIHtcbiAgICBtb3VudChwYXJlbnROb2RlOiBOb2RlKTogdm9pZCxcbiAgICBhY3RpdmF0ZSgpOiB2b2lkLFxuICAgIGRlYWN0aXZhdGUoKTogdm9pZCxcbiAgICB1bm1vdW50KCk6IHZvaWRcbn1cblxuZXhwb3J0IGVudW0gUmVhY3RpdmVOb2RlU3RhdHVzIHtcbiAgICBBY3RpdmUsXG4gICAgSW5hY3RpdmUsXG4gICAgTW91bnRlZCxcbiAgICBVbm1vdW50ZWRcbn07XG5cbmV4cG9ydCBjb25zdCBidWlsZExpZmVjeWNsZUhvb2tzID0gKGhhbmRsZXJzOiBMaWZlY3ljbGVbXSk6IExpZmVjeWNsZSA9PiB7XG4gICAgbGV0IHN0YXR1cyA9IFJlYWN0aXZlTm9kZVN0YXR1cy5Vbm1vdW50ZWQ7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBtb3VudDogKHBhcmVudE5vZGU6IE5vZGUpID0+IHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IFJlYWN0aXZlTm9kZVN0YXR1cy5Vbm1vdW50ZWQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUud2FybihgTW91bnRpbmcgaW4gc3RhdHVzICR7UmVhY3RpdmVOb2RlU3RhdHVzW3N0YXR1c119YCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGhhbmRsZXIgb2YgaGFuZGxlcnMpIGhhbmRsZXIubW91bnQocGFyZW50Tm9kZSk7XG4gICAgICAgICAgICBzdGF0dXMgPSBSZWFjdGl2ZU5vZGVTdGF0dXMuTW91bnRlZDtcbiAgICAgICAgfSxcbiAgICAgICAgYWN0aXZhdGU6ICgpID0+IHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IFJlYWN0aXZlTm9kZVN0YXR1cy5Nb3VudGVkICYmIHN0YXR1cyAhPT0gUmVhY3RpdmVOb2RlU3RhdHVzLkluYWN0aXZlKVxuICAgICAgICAgICAgICAgIHJldHVybiBjb25zb2xlLndhcm4oYEFjdGl2YXRpbmcgaW4gc3RhdHVzICR7UmVhY3RpdmVOb2RlU3RhdHVzW3N0YXR1c119YCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGhhbmRsZXIgb2YgaGFuZGxlcnMpIGhhbmRsZXIuYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIHN0YXR1cyA9IFJlYWN0aXZlTm9kZVN0YXR1cy5BY3RpdmU7XG4gICAgICAgIH0sXG4gICAgICAgIGRlYWN0aXZhdGU6ICgpID0+IHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IFJlYWN0aXZlTm9kZVN0YXR1cy5BY3RpdmUpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUud2FybihgRGVhY3RpdmF0aW5nIGluIHN0YXR1cyAke1JlYWN0aXZlTm9kZVN0YXR1c1tzdGF0dXNdfWApO1xuICAgICAgICAgICAgZm9yIChjb25zdCBoYW5kbGVyIG9mIGhhbmRsZXJzKSBoYW5kbGVyLmRlYWN0aXZhdGUoKVxuICAgICAgICAgICAgc3RhdHVzID0gUmVhY3RpdmVOb2RlU3RhdHVzLkluYWN0aXZlO1xuICAgICAgICB9LFxuICAgICAgICB1bm1vdW50KCkge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gUmVhY3RpdmVOb2RlU3RhdHVzLkluYWN0aXZlKVxuICAgICAgICAgICAgICAgIHJldHVybiBjb25zb2xlLndhcm4oYFVubW91bnRpbmcgaW4gc3RhdHVzICR7UmVhY3RpdmVOb2RlU3RhdHVzW3N0YXR1c119YCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGhhbmRsZXIgb2YgaGFuZGxlcnMpIGhhbmRsZXIudW5tb3VudCgpO1xuICAgICAgICAgICAgc3RhdHVzID0gUmVhY3RpdmVOb2RlU3RhdHVzLlVubW91bnRlZDtcbiAgICAgICAgfSxcbiAgICB9O1xufTtcbiIsCiAgICAiaW1wb3J0IHsgYnVpbGRMaWZlY3ljbGVIb29rcywgdHlwZSBMaWZlY3ljbGUgfSBmcm9tICcuL2xpZmVjeWNsZSc7XG5pbXBvcnQgeyBpbnB1dE9ic2VydmFibGUsIHR5cGUgT2JzZXJ2YWJsZSwgdHlwZSBVcGRhdGFibGUgfSBmcm9tICcuLi9vYnNlcnZhYmxlcyc7XG5cbmV4cG9ydCB0eXBlIFJlYWN0aXZlTm9kZTxUIGV4dGVuZHMgTm9kZT4gPSBMaWZlY3ljbGUgJiBUICYgUmVhY3RpdmVOb2RlU2V0dGVyczxUPjtcblxuZXhwb3J0IGludGVyZmFjZSBSZWFjdGl2ZU5vZGVTZXR0ZXJzPFQgZXh0ZW5kcyBOb2RlPiB7XG4gICAgbGlzdGVuOiA8UiBleHRlbmRzIFJlYWN0aXZlTm9kZTxUPj4oXG4gICAgICAgIHRoaXM6IFIsXG4gICAgICAgIHR5cGU6IHN0cmluZyxcbiAgICAgICAgY2I6IEV2ZW50TGlzdGVuZXJPckV2ZW50TGlzdGVuZXJPYmplY3RcbiAgICApID0+IFI7XG4gICAgY2xrOiA8UiBleHRlbmRzIFJlYWN0aXZlTm9kZTxUPj4oXG4gICAgICAgIHRoaXM6IFIsXG4gICAgICAgIGNiOiBFdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0XG4gICAgKSA9PiBSO1xufVxuXG5leHBvcnQgdHlwZSBUYWdSZWFjdGl2ZU5vZGU8SyBleHRlbmRzIGtleW9mIEhUTUxFbGVtZW50VGFnTmFtZU1hcD4gPVxuICAgIFJlYWN0aXZlTm9kZTxIVE1MRWxlbWVudFRhZ05hbWVNYXBbS10+ICYgVGFnUmVhY3RpdmVOb2RlU2V0dGVyczxLPjtcblxuZXhwb3J0IGludGVyZmFjZSBUYWdSZWFjdGl2ZU5vZGVTZXR0ZXJzPEsgZXh0ZW5kcyBrZXlvZiBIVE1MRWxlbWVudFRhZ05hbWVNYXA+IHtcbiAgICBhdHQ6IChuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpID0+IFRhZ1JlYWN0aXZlTm9kZTxLPjtcbiAgICBjbGFzcyQ6ICh2YWx1ZTogT2JzZXJ2YWJsZTxzdHJpbmc+KSA9PiBUYWdSZWFjdGl2ZU5vZGU8Sz47XG4gICAgYXR0JDogKG5hbWU6IHN0cmluZywgdmFsdWU6IE9ic2VydmFibGU8c3RyaW5nPikgPT4gVGFnUmVhY3RpdmVOb2RlPEs+O1xuICAgIHByb3AkOiA8TiBleHRlbmRzIGtleW9mIEhUTUxFbGVtZW50VGFnTmFtZU1hcFtLXT4oXG4gICAgICAgIG5hbWU6IE4sXG4gICAgICAgIHZhbHVlOiBPYnNlcnZhYmxlPEhUTUxFbGVtZW50VGFnTmFtZU1hcFtLXVtOXT5cbiAgICApID0+IFRhZ1JlYWN0aXZlTm9kZTxLPjtcbiAgICBtb2RlbCQ6IDxJIGV4dGVuZHMgJ2lucHV0JyB8ICd0ZXh0YXJlYScgfCAnc2VsZWN0Jz4oXG4gICAgICAgIHRoaXM6IFRhZ1JlYWN0aXZlTm9kZTxJPixcbiAgICAgICAgdmFsdWUkOiBPYnNlcnZhYmxlPHN0cmluZz4gJiBVcGRhdGFibGU8c3RyaW5nPlxuICAgICkgPT4gVGFnUmVhY3RpdmVOb2RlPEk+O1xufVxuXG5leHBvcnQgY29uc3QgdG9UYWdSZWFjdGl2ZU5vZGUgPSA8SyBleHRlbmRzIGtleW9mIEhUTUxFbGVtZW50VGFnTmFtZU1hcD4oXG4gICAgbm9kZTogSFRNTEVsZW1lbnRUYWdOYW1lTWFwW0tdLFxuICAgIGhhbmRsZXJzOiBMaWZlY3ljbGVbXVxuKTogVGFnUmVhY3RpdmVOb2RlPEs+ID0+IHtcbiAgICBjb25zdCBpbnRlcm5hbEhhbmRsZXJzID0gWy4uLmhhbmRsZXJzXTtcbiAgICBjb25zdCB0YWdOb2RlU2V0dGVycyA9IGJ1aWxkVGFnTm9kZVNldHRlcnM8Sz4oaW50ZXJuYWxIYW5kbGVycyk7XG4gICAgY29uc3Qgbm9kZVNldHRlcnMgPSBidWlsZE5vZGVTZXR0ZXJzKGludGVybmFsSGFuZGxlcnMpO1xuICAgIGNvbnN0IGhvb2tzID0gYnVpbGRMaWZlY3ljbGVIb29rcyhpbnRlcm5hbEhhbmRsZXJzKTtcblxuICAgIHJldHVybiBPYmplY3QuYXNzaWduKG5vZGUsIG5vZGVTZXR0ZXJzLCB0YWdOb2RlU2V0dGVycywgaG9va3MpO1xufTtcblxuZXhwb3J0IGNvbnN0IHRvUmVhY3RpdmVOb2RlID0gPFQgZXh0ZW5kcyBOb2RlPihcbiAgICBub2RlOiBULFxuICAgIGhhbmRsZXJzOiBMaWZlY3ljbGVbXVxuKTogUmVhY3RpdmVOb2RlPFQ+ID0+IHtcbiAgICBjb25zdCBpbnRlcm5hbEhhbmRsZXJzID0gWy4uLmhhbmRsZXJzXTtcbiAgICBjb25zdCBub2RlU2V0dGVycyA9IGJ1aWxkTm9kZVNldHRlcnMoaW50ZXJuYWxIYW5kbGVycyk7XG4gICAgY29uc3QgaG9va3MgPSBidWlsZExpZmVjeWNsZUhvb2tzKGludGVybmFsSGFuZGxlcnMpO1xuXG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24obm9kZSwgbm9kZVNldHRlcnMsIGhvb2tzKTtcbn07XG5cbmNvbnN0IGJ1aWxkVGFnTm9kZVNldHRlcnMgPSA8SyBleHRlbmRzIGtleW9mIEhUTUxFbGVtZW50VGFnTmFtZU1hcD4oXG4gICAgaGFuZGxlcnM6IExpZmVjeWNsZVtdXG4pID0+ICh7XG4gICAgYXR0OiBmdW5jdGlvbiAodGhpczogVGFnUmVhY3RpdmVOb2RlPEs+LCBuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuICAgIGNsYXNzJDogZnVuY3Rpb24gKHRoaXM6IFRhZ1JlYWN0aXZlTm9kZTxLPiwgdmFsdWUkOiBPYnNlcnZhYmxlPHN0cmluZz4pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0JCgnY2xhc3MnLCB2YWx1ZSQpO1xuICAgIH0sXG4gICAgYXR0JDogZnVuY3Rpb24gKFxuICAgICAgICB0aGlzOiBUYWdSZWFjdGl2ZU5vZGU8Sz4sXG4gICAgICAgIG5hbWU6IHN0cmluZyxcbiAgICAgICAgdmFsdWUkOiBPYnNlcnZhYmxlPHN0cmluZz5cbiAgICApIHtcbiAgICAgICAgY29uc3Qgc3Vic2NyaWJlcklkID0gU3ltYm9sKGBBdHRyaWJ1dGU6ICR7bmFtZX1gKVxuXG4gICAgICAgIGhhbmRsZXJzLnB1c2goe1xuICAgICAgICAgICAgbW91bnQ6IChfOiBOb2RlKSA9PiB1bmRlZmluZWQsXG4gICAgICAgICAgICBhY3RpdmF0ZTogKCkgPT4gdmFsdWUkLnN1YnNjcmliZUluaXQoXG4gICAgICAgICAgICAgICAgc3Vic2NyaWJlcklkLFxuICAgICAgICAgICAgICAgICh2YWx1ZTogc3RyaW5nKSA9PiB0aGlzLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSkpLFxuICAgICAgICAgICAgZGVhY3RpdmF0ZTogKCkgPT4gdmFsdWUkLnVuc3Vic2NyaWJlKHN1YnNjcmliZXJJZCksXG4gICAgICAgICAgICB1bm1vdW50OiAoKSA9PiB1bmRlZmluZWRcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcbiAgICBtb2RlbCQ6IGZ1bmN0aW9uPEkgZXh0ZW5kcyAnaW5wdXQnIHwgJ3RleHRhcmVhJyB8ICdzZWxlY3QnPihcbiAgICAgICAgdGhpczogVGFnUmVhY3RpdmVOb2RlPEk+LFxuICAgICAgICB2YWx1ZSQ6IE9ic2VydmFibGU8c3RyaW5nPiAmIFVwZGF0YWJsZTxzdHJpbmc+XG4gICAgKSB7XG4gICAgICAgIGNvbnN0IGlucHV0JCA9IGlucHV0T2JzZXJ2YWJsZSh0aGlzLCB2YWx1ZSQpO1xuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICAgICAgLnByb3AkKCd2YWx1ZScsIGlucHV0JClcbiAgICAgICAgICAgIC5saXN0ZW4oJ2lucHV0JywgKF9lKSA9PiBpbnB1dCQudXBkYXRlKChfKSA9PiB0aGlzLnZhbHVlKSk7XG4gICAgfSxcbiAgICBwcm9wJDogZnVuY3Rpb24gPE4gZXh0ZW5kcyBrZXlvZiBIVE1MRWxlbWVudFRhZ05hbWVNYXBbS10+KFxuICAgICAgICB0aGlzOiBUYWdSZWFjdGl2ZU5vZGU8Sz4sXG4gICAgICAgIG5hbWU6IE4sXG4gICAgICAgIHZhbHVlJDogT2JzZXJ2YWJsZTxIVE1MRWxlbWVudFRhZ05hbWVNYXBbS11bTl0+XG4gICAgKSB7XG4gICAgICAgIGNvbnN0IHN1YnNjcmliZXJJZCA9IFN5bWJvbChgUHJvcGVydHk6ICR7bmFtZS50b1N0cmluZygpfWApXG5cbiAgICAgICAgaGFuZGxlcnMucHVzaCh7XG4gICAgICAgICAgICBtb3VudDogKF86IE5vZGUpID0+IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGFjdGl2YXRlOiAoKSA9PiB2YWx1ZSQuc3Vic2NyaWJlSW5pdChcbiAgICAgICAgICAgICAgICBzdWJzY3JpYmVySWQsXG4gICAgICAgICAgICAgICAgKHZhbHVlKSA9PiAodGhpcyBhcyBIVE1MRWxlbWVudFRhZ05hbWVNYXBbS10pW25hbWVdID0gdmFsdWUpLFxuICAgICAgICAgICAgZGVhY3RpdmF0ZTogKCkgPT4gdmFsdWUkLnVuc3Vic2NyaWJlKHN1YnNjcmliZXJJZCksXG4gICAgICAgICAgICB1bm1vdW50OiAoKSA9PiB1bmRlZmluZWRcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufSk7XG5cbmNvbnN0IGJ1aWxkTm9kZVNldHRlcnMgPSA8VCBleHRlbmRzIE5vZGU+KFxuICAgIGhhbmRsZXJzOiBMaWZlY3ljbGVbXVxuKSA9PiAoe1xuICAgIGNsazogZnVuY3Rpb24gPFIgZXh0ZW5kcyBSZWFjdGl2ZU5vZGU8VD4+KFxuICAgICAgICB0aGlzOiBSLFxuICAgICAgICBjYWxsYmFjazogRXZlbnRMaXN0ZW5lck9yRXZlbnRMaXN0ZW5lck9iamVjdFxuICAgICkge1xuICAgICAgICByZXR1cm4gdGhpcy5saXN0ZW4oJ2NsaWNrJywgY2FsbGJhY2spO1xuICAgIH0sXG4gICAgbGlzdGVuOiBmdW5jdGlvbiA8UiBleHRlbmRzIFJlYWN0aXZlTm9kZTxUPj4oXG4gICAgICAgIHRoaXM6IFIsXG4gICAgICAgIHR5cGU6IHN0cmluZyxcbiAgICAgICAgY2FsbGJhY2s6IEV2ZW50TGlzdGVuZXJPckV2ZW50TGlzdGVuZXJPYmplY3RcbiAgICApIHtcbiAgICAgICAgaGFuZGxlcnMucHVzaCh7XG4gICAgICAgICAgICBtb3VudDogKF86IE5vZGUpID0+IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGFjdGl2YXRlOiAoKSA9PiB0aGlzLmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgY2FsbGJhY2spLFxuICAgICAgICAgICAgZGVhY3RpdmF0ZTogKCkgPT4gdGhpcy5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGNhbGxiYWNrKSxcbiAgICAgICAgICAgIHVubW91bnQ6ICgpID0+IHVuZGVmaW5lZFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59KTtcbiIsCiAgICAiaW1wb3J0IHtcbiAgICBzY29wZWRPYnNlcnZhYmxlLFxuICAgIFNjb3BlZE9ic2VydmFibGUsXG4gICAgdHlwZSBPYnNlcnZhYmxlXG59IGZyb20gXCIuLi9vYnNlcnZhYmxlc1wiO1xuaW1wb3J0IHsgdG9SZWFjdGl2ZU5vZGUsIHR5cGUgUmVhY3RpdmVOb2RlIH0gZnJvbSBcIi4uL3JlYWN0aXZlL2V4dGVuc2lvbnNcIjtcblxudHlwZSBPYnNlcnZhYmxlcyA9IFJlY29yZDxzdHJpbmcsIE9ic2VydmFibGU8YW55Pj47XG50eXBlIFNjb3BlZE9ic2VydmFibGVzPFQgZXh0ZW5kcyBPYnNlcnZhYmxlcz4gPSB7XG4gICAgW0sgaW4ga2V5b2YgVF06IFNjb3BlZE9ic2VydmFibGU8VFtLXT5cbn07XG5cbnR5cGUgUmVuZGVyRm48TyBleHRlbmRzIE9ic2VydmFibGVzLCBUIGV4dGVuZHMgTm9kZSwgUD4gPVxuICAgICh0aGlzOiBDb250ZXh0PFQsIFA+LCBvYnNlcnZhYmxlczogU2NvcGVkT2JzZXJ2YWJsZXM8Tz4pID0+IFJlYWN0aXZlTm9kZTxUPjtcblxudHlwZSBVc2VyT3B0czxPMSBleHRlbmRzIE9ic2VydmFibGVzLCBPMiBleHRlbmRzIE9ic2VydmFibGVzLCBUIGV4dGVuZHMgTm9kZSwgUD4gPVxuICAgIFBhcnRpYWw8T3B0czxPMSwgTzIsIFQsIFA+PiAmIHsgcmVuZGVyOiBSZW5kZXJGbjxPMSAmIE8yLCBULCBQPiB9O1xuXG50eXBlIE9wdHM8TzEgZXh0ZW5kcyBPYnNlcnZhYmxlcywgTzIgZXh0ZW5kcyBPYnNlcnZhYmxlcywgVCBleHRlbmRzIE5vZGUsIFA+ID0ge1xuICAgIHJlbmRlcjogUmVuZGVyRm48TzEgJiBPMiwgVCwgUD4sXG4gICAgb2JzZXJ2YWJsZXM6ICgpID0+IE8xLFxuICAgIGRlcml2ZWRPYnNlcnZhYmxlczogKG9ic2VydmFibGVzOiBPMSkgPT4gTzIsXG4gICAgY2FjaGU6IGJvb2xlYW4sXG4gICAgcHJvcHM6IFBcbn07XG5cbmNvbnN0IGRlZmF1bHRPcHRzID0ge1xuICAgIG9ic2VydmFibGVzOiAoKSA9PiAoe30pLFxuICAgIGRlcml2ZWRPYnNlcnZhYmxlczogKCkgPT4gKHt9KSxcbiAgICBjYWNoZTogZmFsc2UsXG4gICAgcHJvcHM6IHt9XG59O1xuXG5leHBvcnQgY29uc3QgY29tcG9uZW50ID0gPFxuICAgIE8xIGV4dGVuZHMgT2JzZXJ2YWJsZXMsXG4gICAgTzIgZXh0ZW5kcyBPYnNlcnZhYmxlcyxcbiAgICBUIGV4dGVuZHMgTm9kZSxcbiAgICBQXG4+KG9wdHM6IFVzZXJPcHRzPE8xLCBPMiwgVCwgUD4pOiBSZWFjdGl2ZU5vZGU8Q29tbWVudD4gPT4gbmV3IENvbXBvbmVudDxPMSwgTzIsIFQsIFA+KFxuICAgIE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRPcHRzLCBvcHRzKVxuKS50b1JlYWN0aXZlTm9kZSgpO1xuXG5jbGFzcyBDb250ZXh0PFQgZXh0ZW5kcyBOb2RlLCBQPiB7XG4gICAgbm9kZTogUmVhY3RpdmVOb2RlPFQ+IHwgdW5kZWZpbmVkO1xuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBwYXJlbnQ6IE5vZGUsIHB1YmxpYyBwcm9wczogUCkgeyB9XG59XG5cbmNsYXNzIENvbXBvbmVudDxPMSBleHRlbmRzIE9ic2VydmFibGVzLCBPMiBleHRlbmRzIE9ic2VydmFibGVzLCBUIGV4dGVuZHMgTm9kZSwgUD4ge1xuICAgIHByaXZhdGUgbm9kZTogUmVhY3RpdmVOb2RlPFQ+IHwgdW5kZWZpbmVkO1xuICAgIHByaXZhdGUgb2JzZXJ2YWJsZXM6IFNjb3BlZE9ic2VydmFibGVzPE8xICYgTzI+IHwgdW5kZWZpbmVkO1xuICAgIHByaXZhdGUgY29udGV4dDogQ29udGV4dDxULCBQPiB8IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgb3B0czogT3B0czxPMSwgTzIsIFQsIFA+KSB7IH1cblxuICAgIHRvUmVhY3RpdmVOb2RlKCkge1xuICAgICAgICByZXR1cm4gdG9SZWFjdGl2ZU5vZGUoZG9jdW1lbnQuY3JlYXRlQ29tbWVudCgnQ29tcG9uZW50JyksIFt7XG4gICAgICAgICAgICBtb3VudDogKHBhcmVudE5vZGU6IE5vZGUpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5ub2RlID09PSB1bmRlZmluZWQgfHwgIXRoaXMub3B0cy5jYWNoZSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5vZGUocGFyZW50Tm9kZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5ub2RlPy5tb3VudChwYXJlbnROb2RlKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhY3RpdmF0ZTogKCkgPT4gdGhpcy5ub2RlPy5hY3RpdmF0ZSgpLFxuICAgICAgICAgICAgZGVhY3RpdmF0ZTogKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMubm9kZT8uZGVhY3RpdmF0ZSgpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLm9ic2VydmFibGVzID09PSB1bmRlZmluZWQpIHJldHVybjtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLm9ic2VydmFibGVzKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLm9ic2VydmFibGVzW2tleV0/LnVuc3Vic2NyaWJlQWxsKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdW5tb3VudDogKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMubm9kZT8udW5tb3VudCgpO1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5vcHRzLmNhY2hlKSB0aGlzLmNsZWFuVXAoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfV0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2V0dXBOb2RlKHBhcmVudE5vZGU6IE5vZGUpIHtcbiAgICAgICAgdGhpcy5vYnNlcnZhYmxlcyA9IHRoaXMuYnVpbGRPYnNlcnZhYmxlcygpO1xuICAgICAgICB0aGlzLmNvbnRleHQgPSBuZXcgQ29udGV4dChwYXJlbnROb2RlLCB0aGlzLm9wdHMucHJvcHMpO1xuICAgICAgICB0aGlzLm5vZGUgPSB0aGlzLm9wdHMucmVuZGVyLmNhbGwodGhpcy5jb250ZXh0LCB0aGlzLm9ic2VydmFibGVzKTtcbiAgICAgICAgdGhpcy5jb250ZXh0Lm5vZGUgPSB0aGlzLm5vZGU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjbGVhblVwKCkge1xuICAgICAgICBpZiAodGhpcy5jb250ZXh0ICE9PSB1bmRlZmluZWQpIHRoaXMuY29udGV4dC5ub2RlID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLm5vZGUgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMub2JzZXJ2YWJsZXMgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZE9ic2VydmFibGVzKCkge1xuICAgICAgICBjb25zdCBjb3JlT2JzZXJ2YWJsZXMgPSB0aGlzLm9wdHMub2JzZXJ2YWJsZXMoKTtcbiAgICAgICAgY29uc3QgZGVyaXZlZE9ic2VydmFibGVzID0gdGhpcy5vcHRzLmRlcml2ZWRPYnNlcnZhYmxlcyhjb3JlT2JzZXJ2YWJsZXMpO1xuICAgICAgICBjb25zdCBvYnNlcnZhYmxlcyA9XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHt9LCBjb3JlT2JzZXJ2YWJsZXMsIGRlcml2ZWRPYnNlcnZhYmxlcyk7XG4gICAgICAgIHJldHVybiB0aGlzLnRvU2NvcGVkPE8xICYgTzI+KG9ic2VydmFibGVzKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRvU2NvcGVkPE8gZXh0ZW5kcyBPYnNlcnZhYmxlcz4ob2JzZXJ2YWJsZXM6IE8pOiBTY29wZWRPYnNlcnZhYmxlczxPPiB7XG4gICAgICAgIGNvbnN0IHNjb3BlZE9ic2VydmFibGVzOiBQYXJ0aWFsPFNjb3BlZE9ic2VydmFibGVzPE8+PiA9IHt9O1xuXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIG9ic2VydmFibGVzKSB7XG4gICAgICAgICAgICBjb25zdCBrOiBrZXlvZiBPID0ga2V5O1xuICAgICAgICAgICAgc2NvcGVkT2JzZXJ2YWJsZXNba10gPSBzY29wZWRPYnNlcnZhYmxlKG9ic2VydmFibGVzW2tdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzY29wZWRPYnNlcnZhYmxlcyBhcyBTY29wZWRPYnNlcnZhYmxlczxPPjtcbiAgICB9XG59XG4iLAogICAgImltcG9ydCB7IG9ic2VydmFibGUsIHR5cGUgT2JzZXJ2YWJsZSwgdHlwZSBVcGRhdGFibGUgfSBmcm9tIFwiLi4vb2JzZXJ2YWJsZXNcIjtcbmltcG9ydCB0eXBlIHsgRXZlbnQgfSBmcm9tIFwiLi4vbm9kZXNcIjtcblxudHlwZSBTb3VyY2U8VD4gPSBPYnNlcnZhYmxlPEV2ZW50PFQ+PiAmIFVwZGF0YWJsZTxFdmVudDxUPj47XG5cbmV4cG9ydCBjbGFzcyBSZWFjdGl2ZUFycmF5PFQ+IHtcbiAgICBwcml2YXRlIG9ic2VydmFibGVzOiBXZWFrUmVmPFNvdXJjZTxUPj5bXSA9IFtdO1xuXG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBpdGVtczogVFtdID0gW10pIHsgfVxuXG4gICAgZ2V0IG9ic2VydmFibGUkKCk6IFNvdXJjZTxUPiB7XG4gICAgICAgIGNvbnN0IG9icyQgPSBvYnNlcnZhYmxlPEV2ZW50PFQ+Pih7IHR5cGU6IFwicmVwbGFjZVwiLCBpdGVtczogdGhpcy5pdGVtcyB9KTtcbiAgICAgICAgdGhpcy5vYnNlcnZhYmxlcy5wdXNoKG5ldyBXZWFrUmVmKG9icyQpKTtcbiAgICAgICAgcmV0dXJuIG9icyQ7XG4gICAgfTtcblxuICAgIHB1c2goLi4uaXRlbXM6IFRbXSk6IHZvaWQge1xuICAgICAgICB0aGlzLml0ZW1zLnB1c2goLi4uaXRlbXMpO1xuICAgICAgICB0aGlzLmVtaXQoeyB0eXBlOiBcImFwcGVuZFwiLCBpdGVtczogaXRlbXMgfSlcbiAgICB9XG5cbiAgICBwb3AoKTogVCB8IHVuZGVmaW5lZCB7XG4gICAgICAgIGlmICh0aGlzLml0ZW1zLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuaXRlbXMubGVuZ3RoIC0gMTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB0aGlzLml0ZW1zLnBvcCgpIGFzIFQ7XG5cbiAgICAgICAgdGhpcy5lbWl0KHsgdHlwZTogXCJyZW1vdmVcIiwgaXRlbXM6IG5ldyBNYXAoKS5zZXQoaW5kZXgsIHZhbHVlKSB9KTtcblxuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgcmVtb3ZlKGluZGljZXM6IG51bWJlcltdKTogdm9pZCB7XG4gICAgICAgIGlmIChpbmRpY2VzLmxlbmd0aCA9PSAwKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGV2ZW50SXRlbXMgPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3QgaWR4IG9mIGluZGljZXMpIHtcbiAgICAgICAgICAgIGlmICghKGlkeCBpbiB0aGlzLml0ZW1zKSkgY29udGludWU7XG4gICAgICAgICAgICBldmVudEl0ZW1zLnNldChpZHgsIHRoaXMuaXRlbXNbaWR4XSk7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5pdGVtc1tpZHhdO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZW1pdCh7IHR5cGU6IFwicmVtb3ZlXCIsIGl0ZW1zOiBldmVudEl0ZW1zIH0pO1xuICAgIH1cblxuICAgIHJlcGxhY2UoaXRlbXM6IFRbXSk6IHZvaWQge1xuICAgICAgICB0aGlzLml0ZW1zID0gaXRlbXM7XG4gICAgICAgIHRoaXMuZW1pdCh7IHR5cGU6IFwicmVwbGFjZVwiLCBpdGVtczogaXRlbXMgfSk7XG4gICAgfVxuXG4gICAgcmVwbGFjZUtleXMoaXRlbXM6IE1hcDxudW1iZXIsIFQ+KTogdm9pZCB7XG4gICAgICAgIGZvciAoY29uc3QgW2lkeCwgdmFsdWVdIG9mIGl0ZW1zLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgaWYgKCEoaWR4IGluIHRoaXMuaXRlbXMpKSBjb250aW51ZTtcbiAgICAgICAgICAgIHRoaXMuaXRlbXNbaWR4XSA9IHZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5lbWl0KHsgdHlwZTogXCJyZXBsYWNlS2V5c1wiLCBpdGVtczogaXRlbXMgfSlcbiAgICB9XG5cbiAgICBwcml2YXRlIGVtaXQoZXZlbnQ6IEV2ZW50PFQ+KSB7XG4gICAgICAgIGNvbnN0IHVwZGF0ZUZuID0gKF86IEV2ZW50PFQ+KSA9PiBldmVudDtcbiAgICAgICAgZm9yIChjb25zdCBvYnMkIG9mIHRoaXMub2JzZXJ2YWJsZXMpXG4gICAgICAgICAgICBvYnMkLmRlcmVmKCk/LnVwZGF0ZSh1cGRhdGVGbik7XG4gICAgfVxufVxuIiwKICAgICJpbXBvcnQgeyB0b1JlYWN0aXZlTm9kZSwgdHlwZSBSZWFjdGl2ZU5vZGUgfSBmcm9tIFwiLi4vcmVhY3RpdmVcIjtcblxuZXhwb3J0IGNvbnN0IHJlYWN0aXZlVGV4dE5vZGUgPSAodGV4dDogc3RyaW5nKTogUmVhY3RpdmVOb2RlPFRleHQ+ID0+IHtcbiAgICBjb25zdCB0ZXh0Tm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpO1xuICAgIGNvbnN0IGhvb2tzID0gW3tcbiAgICAgICAgbW91bnQ6IChwYXJlbnROb2RlOiBOb2RlKSA9PiBwYXJlbnROb2RlLmFwcGVuZENoaWxkKHRleHROb2RlKSxcbiAgICAgICAgYWN0aXZhdGU6ICgpID0+IHVuZGVmaW5lZCxcbiAgICAgICAgZGVhY3RpdmF0ZTogKCkgPT4gdW5kZWZpbmVkLFxuICAgICAgICB1bm1vdW50OiAoKSA9PiB0ZXh0Tm9kZS5yZW1vdmUoKVxuICAgIH1dO1xuXG4gICAgcmV0dXJuIHRvUmVhY3RpdmVOb2RlKHRleHROb2RlLCBob29rcyk7XG59XG4iLAogICAgImltcG9ydCB7IGRlZHVwT2JzZXJ2YWJsZSwgdHlwZSBPYnNlcnZhYmxlIH0gZnJvbSBcIi4uL29ic2VydmFibGVzXCI7XG5pbXBvcnQgeyB0b1JlYWN0aXZlTm9kZSwgdHlwZSBSZWFjdGl2ZU5vZGUgfSBmcm9tIFwiLi4vcmVhY3RpdmUvZXh0ZW5zaW9uc1wiO1xuaW1wb3J0IHsgcmVhY3RpdmVUZXh0Tm9kZSB9IGZyb20gXCIuL3JlYWN0aXZlXCI7XG5cbnR5cGUgUmVhY3RpdmVOb2RlQnVpbGRlcjxUIGV4dGVuZHMgTm9kZT4gPSAoKCkgPT4gUmVhY3RpdmVOb2RlPFQ+KTtcblxudHlwZSBQYXJhbXM8QSBleHRlbmRzIE5vZGUsIEIgZXh0ZW5kcyBOb2RlPiA9IHtcbiAgICBpZiQ6IE9ic2VydmFibGU8Ym9vbGVhbj4sXG4gICAgdGhlbj86IFJlYWN0aXZlTm9kZUJ1aWxkZXI8QT4gfCBzdHJpbmcgfCB1bmRlZmluZWQsXG4gICAgb3RoZXJ3aXNlPzogUmVhY3RpdmVOb2RlQnVpbGRlcjxCPiB8IHN0cmluZyB8IHVuZGVmaW5lZFxufTtcblxudHlwZSBDdXJyZW50Tm9kZTxBIGV4dGVuZHMgTm9kZSwgQiBleHRlbmRzIE5vZGU+ID1cbiAgICBSZWFjdGl2ZU5vZGU8QT4gfCBSZWFjdGl2ZU5vZGU8Qj4gfCBSZWFjdGl2ZU5vZGU8VGV4dD47XG5cbmV4cG9ydCBjb25zdCBjb25kID0gPEEgZXh0ZW5kcyBOb2RlLCBCIGV4dGVuZHMgTm9kZT4oXG4gICAgeyBpZiQsIHRoZW4sIG90aGVyd2lzZSB9OiBQYXJhbXM8QSwgQj5cbik6IFJlYWN0aXZlTm9kZTxDb21tZW50PiA9PiBuZXcgQ29uZDxBLCBCPihcbiAgICBkZWR1cE9ic2VydmFibGUoaWYkKSxcbiAgICB0aGVuLFxuICAgIG90aGVyd2lzZVxuKS50b1JlYWN0aXZlTm9kZSgpO1xuXG5jbGFzcyBDb25kPEEgZXh0ZW5kcyBOb2RlLCBCIGV4dGVuZHMgTm9kZT4ge1xuICAgIHByaXZhdGUgaWQgPSBTeW1ib2woJ0NvbmQnKTtcbiAgICBwcml2YXRlIGN1cnJlbnROb2RlOiBDdXJyZW50Tm9kZTxBLCBCPiB8IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgICBwcml2YXRlIGlmJDogT2JzZXJ2YWJsZTxib29sZWFuPixcbiAgICAgICAgcHJpdmF0ZSB0aGVuOiBSZWFjdGl2ZU5vZGVCdWlsZGVyPEE+IHwgc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgICAgICBwcml2YXRlIG90aGVyd2lzZTogUmVhY3RpdmVOb2RlQnVpbGRlcjxCPiB8IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgICkgeyB9XG5cbiAgICB0b1JlYWN0aXZlTm9kZSgpIHtcbiAgICAgICAgY29uc3QgYW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlQ29tbWVudCgnQ29uZCcpO1xuICAgICAgICBjb25zdCB1cGRhdGVGbiA9ICh2YWx1ZTogYm9vbGVhbikgPT4gdGhpcy51cGRhdGVOb2RlKGFuY2hvciwgdmFsdWUpO1xuXG4gICAgICAgIHJldHVybiB0b1JlYWN0aXZlTm9kZShhbmNob3IsIFt7XG4gICAgICAgICAgICBtb3VudDogKHBhcmVudE5vZGU6IE5vZGUpID0+IHBhcmVudE5vZGUuYXBwZW5kQ2hpbGQoYW5jaG9yKSxcbiAgICAgICAgICAgIGFjdGl2YXRlOiAoKSA9PiB0aGlzLmlmJC5zdWJzY3JpYmVJbml0KHRoaXMuaWQsIHVwZGF0ZUZuKSxcbiAgICAgICAgICAgIGRlYWN0aXZhdGU6ICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmlmJC51bnN1YnNjcmliZSh0aGlzLmlkKTtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlPy5kZWFjdGl2YXRlKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdW5tb3VudDogKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGU/LnVubW91bnQoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGFuY2hvci5yZW1vdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfV0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlTm9kZShhbmNob3I6IE5vZGUsIHZhbHVlOiBib29sZWFuKSB7XG4gICAgICAgIGNvbnN0IG5ld05vZGUgPSB2YWx1ZSA/XG4gICAgICAgICAgICB0aGlzLmJ1aWxkTm9kZTxBPih0aGlzLnRoZW4pIDpcbiAgICAgICAgICAgIHRoaXMuYnVpbGROb2RlPEI+KHRoaXMub3RoZXJ3aXNlKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc3dpdGNoTm9kZShhbmNob3IsIG5ld05vZGUpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZE5vZGU8VCBleHRlbmRzIE5vZGU+KG5vZGU6IHN0cmluZyB8IFJlYWN0aXZlTm9kZUJ1aWxkZXI8VD4gfCB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKHR5cGVvZiAobm9kZSkgPT09ICdmdW5jdGlvbicpIHJldHVybiBub2RlKCk7XG4gICAgICAgIGlmICh0eXBlb2YgKG5vZGUpID09PSAnc3RyaW5nJykgcmV0dXJuIHJlYWN0aXZlVGV4dE5vZGUobm9kZSk7XG4gICAgICAgIGlmIChub2RlID09PSB1bmRlZmluZWQpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVuL290aGVyd2lzZSBzaG91bGQgYmUgZWl0aGVyIHN0cmluZyBvciBmdW5jdGlvbicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3dpdGNoTm9kZShhbmNob3I6IE5vZGUsIG5ld05vZGU6IEN1cnJlbnROb2RlPEEsIEI+IHwgdW5kZWZpbmVkKSB7XG4gICAgICAgIHRoaXMuY3VycmVudE5vZGU/LmRlYWN0aXZhdGUoKTtcbiAgICAgICAgdGhpcy5jdXJyZW50Tm9kZT8udW5tb3VudCgpO1xuICAgICAgICB0aGlzLmN1cnJlbnROb2RlID0gbmV3Tm9kZTtcblxuICAgICAgICBpZiAobmV3Tm9kZSA9PT0gdW5kZWZpbmVkKSByZXR1cm47XG5cbiAgICAgICAgbmV3Tm9kZS5tb3VudChhbmNob3IucGFyZW50Tm9kZSEpO1xuICAgICAgICBhbmNob3IucGFyZW50Tm9kZT8uaW5zZXJ0QmVmb3JlKG5ld05vZGUsIGFuY2hvci5uZXh0U2libGluZyk7XG4gICAgICAgIG5ld05vZGUuYWN0aXZhdGUoKTtcbiAgICB9XG59XG4iLAogICAgImltcG9ydCB0eXBlIHsgUmVhY3RpdmVOb2RlIH0gZnJvbSBcIi4uLy4uL3JlYWN0aXZlL2V4dGVuc2lvbnNcIjtcblxuZXhwb3J0IGNsYXNzIFJlYWN0aXZlSXRlbTxULCBOIGV4dGVuZHMgUmVhY3RpdmVOb2RlPE5vZGU+PiB7XG4gICAgcHVibGljIGdlbmVyYXRpb25JZD86IG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgICBwdWJsaWMgYW5jaG9yOiBOb2RlLFxuICAgICAgICBwdWJsaWMgdmFsdWU6IFQsXG4gICAgICAgIHB1YmxpYyBub2RlOiBOXG4gICAgKSB7IH1cblxuICAgIG1vdW50KHJlZkl0ZW06IFJlYWN0aXZlSXRlbTxULCBOPiB8IG51bGwpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IHRoaXMuYW5jaG9yLnBhcmVudE5vZGU7XG4gICAgICAgIGNvbnN0IGluc2VydEJlZm9yZSA9IHJlZkl0ZW0/Lm5vZGUubmV4dFNpYmxpbmcgfHwgbnVsbDtcblxuICAgICAgICBpZiAocGFyZW50Tm9kZSA9PT0gbnVsbCkgcmV0dXJuO1xuICAgICAgICBpZiAodGhpcy5ub2RlLnBhcmVudE5vZGUgPT09IG51bGwpIHRoaXMubm9kZS5tb3VudChwYXJlbnROb2RlKTtcblxuICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLm5vZGUsIGluc2VydEJlZm9yZSk7XG4gICAgfVxuXG4gICAgYWN0aXZhdGUoZ2VuZXJhdGlvbklkOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuZ2VuZXJhdGlvbklkID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICB0aGlzLm5vZGUuYWN0aXZhdGUoKTtcbiAgICAgICAgdGhpcy5nZW5lcmF0aW9uSWQgPSBnZW5lcmF0aW9uSWQ7XG4gICAgfVxuXG4gICAgZGVhY3RpdmF0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ub2RlLmRlYWN0aXZhdGUoKTtcbiAgICB9XG5cbiAgICB1bm1vdW50KCk6IHZvaWQge1xuICAgICAgICB0aGlzLm5vZGUudW5tb3VudCgpO1xuICAgIH1cbn1cbiIsCiAgICAiaW1wb3J0IHR5cGUgeyBSZWFjdGl2ZU5vZGUgfSBmcm9tIFwiLi4vLi4vcmVhY3RpdmUvZXh0ZW5zaW9uc1wiO1xuaW1wb3J0IHsgUmVhY3RpdmVJdGVtIH0gZnJvbSBcIi4vaXRlbVwiO1xuXG5leHBvcnQgdHlwZSBLZXkgPSBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgc3ltYm9sO1xuZXhwb3J0IHR5cGUgS2V5Rm48SyBleHRlbmRzIEtleSwgVD4gPSAoKGtleTogS2V5LCB2YWx1ZTogVCkgPT4gSyk7XG5leHBvcnQgdHlwZSBCdWlsZEZuPE4gZXh0ZW5kcyBOb2RlLCBUPiA9ICgoa2V5OiBLZXksIHZhbHVlOiBUKSA9PiBSZWFjdGl2ZU5vZGU8Tj4pO1xuZXhwb3J0IHR5cGUgQ29sbGVjdGlvbjxUPiA9IEFycmF5PFQ+IHwgTWFwPEtleSwgVD47XG5cbmV4cG9ydCBjbGFzcyBSZWFjdGl2ZUl0ZW1Db2xsZWN0aW9uPEsgZXh0ZW5kcyBLZXksIFQsIE4gZXh0ZW5kcyBSZWFjdGl2ZU5vZGU8Tm9kZT4+IHtcbiAgICBwcml2YXRlIGdlbmVyYXRpb25JZCA9IDA7XG4gICAgcHJpdmF0ZSBpdGVtcyA9IG5ldyBNYXA8SywgUmVhY3RpdmVJdGVtPFQsIE4+PigpO1xuXG4gICAgY29uc3RydWN0b3IoXG4gICAgICAgIHByaXZhdGUga2V5Rm46IEtleUZuPEssIFQ+LFxuICAgICAgICBwcml2YXRlIGJ1aWxkRm46IEJ1aWxkRm48TiwgVD4sXG4gICAgKSB7IH1cblxuICAgIGRlYWN0aXZhdGUoKTogdm9pZCB7XG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLml0ZW1zLnZhbHVlcygpKSBcbiAgICAgICAgICAgIGl0ZW0uZGVhY3RpdmF0ZSgpO1xuICAgIH1cblxuICAgIHVubW91bnQoKTogdm9pZCB7XG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLml0ZW1zLnZhbHVlcygpKVxuICAgICAgICAgICAgaXRlbS51bm1vdW50KCk7XG4gICAgICAgIHRoaXMuaXRlbXMuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5nZW5lcmF0aW9uSWQgPSAwO1xuICAgIH1cblxuICAgIHJlcGxhY2UoYW5jaG9yOiBOb2RlLCBuZXdJdGVtczogQ29sbGVjdGlvbjxUPik6IHZvaWQge1xuICAgICAgICB0aGlzLmdlbmVyYXRpb25JZCsrO1xuICAgICAgICBsZXQgcmVmSXRlbSA9IG51bGw7XG5cbiAgICAgICAgZm9yIChjb25zdCBbaywgdmFsdWVdIG9mIG5ld0l0ZW1zLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gdGhpcy5rZXlGbihrLCB2YWx1ZSk7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gdGhpcy5nZXRPckluc2VydChhbmNob3IsIHJlZkl0ZW0sIGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgaXRlbS5nZW5lcmF0aW9uSWQgPSB0aGlzLmdlbmVyYXRpb25JZDtcbiAgICAgICAgICAgIHJlZkl0ZW0gPSBpdGVtO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yZW1vdmVTdGFsZUl0ZW1zKCk7XG4gICAgfVxuXG4gICAgcmVwbGFjZUtleXMoYW5jaG9yOiBOb2RlLCBpdGVtczogQ29sbGVjdGlvbjxUPik6IHZvaWQge1xuICAgICAgICBmb3IgKGNvbnN0IFtrLCB2YWx1ZV0gb2YgaXRlbXMuZW50cmllcygpKSB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0aGlzLmtleUZuKGssIHZhbHVlKTtcbiAgICAgICAgICAgIGNvbnN0IHJlZkl0ZW0gPSB0aGlzLml0ZW1zLmdldChrZXkpO1xuXG4gICAgICAgICAgICBpZiAocmVmSXRlbSA9PT0gdW5kZWZpbmVkKSBjb250aW51ZTtcblxuICAgICAgICAgICAgdGhpcy5pbnNlcnRJdGVtKGFuY2hvciwgcmVmSXRlbSwga2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICByZWZJdGVtLmRlYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIHJlZkl0ZW0udW5tb3VudCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXBwZW5kKGFuY2hvcjogTm9kZSwgbmV3SXRlbXM6IENvbGxlY3Rpb248VD4pOiB2b2lkIHtcbiAgICAgICAgZm9yIChjb25zdCBbaywgdmFsdWVdIG9mIG5ld0l0ZW1zLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gdGhpcy5rZXlGbihrLCB2YWx1ZSk7XG4gICAgICAgICAgICB0aGlzLmluc2VydEl0ZW0oYW5jaG9yLCBudWxsLCBrZXksIHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlbW92ZShpdGVtczogQ29sbGVjdGlvbjxUPik6IHZvaWQge1xuICAgICAgICBmb3IgKGNvbnN0IFtrLCB2YWx1ZV0gb2YgaXRlbXMuZW50cmllcygpKSB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0aGlzLmtleUZuKGssIHZhbHVlKTtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zLmdldChrZXkpO1xuICAgICAgICAgICAgaWYgKGl0ZW0gPT09IHVuZGVmaW5lZCkgY29udGludWU7XG4gICAgICAgICAgICBpdGVtLmRlYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIGl0ZW0udW5tb3VudCgpO1xuICAgICAgICAgICAgdGhpcy5pdGVtcy5kZWxldGUoa2V5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0T3JJbnNlcnQoYW5jaG9yOiBOb2RlLCByZWZJdGVtOiBSZWFjdGl2ZUl0ZW08VCwgTj4gfCBudWxsLCBrZXk6IEssIHZhbHVlOiBUKSB7XG4gICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zLmdldChrZXkpO1xuXG4gICAgICAgIGlmIChpdGVtID09PSB1bmRlZmluZWQpIHJldHVybiB0aGlzLmluc2VydEl0ZW0oYW5jaG9yLCByZWZJdGVtLCBrZXksIHZhbHVlKTtcbiAgICAgICAgaWYgKGl0ZW0udmFsdWUgPT09IHZhbHVlKSByZXR1cm4gaXRlbTtcblxuICAgICAgICBpdGVtLmRlYWN0aXZhdGUoKTtcbiAgICAgICAgaXRlbS51bm1vdW50KCk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuaW5zZXJ0SXRlbShhbmNob3IsIHJlZkl0ZW0sIGtleSwgdmFsdWUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgaW5zZXJ0SXRlbShhbmNob3I6IE5vZGUsIHJlZkl0ZW06IFJlYWN0aXZlSXRlbTxULCBOPiB8IG51bGwsIGtleTogSywgdmFsdWU6IFQpIHtcbiAgICAgICAgY29uc3QgbmV3Tm9kZSA9IHRoaXMuYnVpbGRGbihrZXksIHZhbHVlKTtcbiAgICAgICAgY29uc3QgaXRlbSA9IG5ldyBSZWFjdGl2ZUl0ZW0oYW5jaG9yLCB2YWx1ZSwgbmV3Tm9kZSk7XG4gICAgICAgIFxuICAgICAgICBpdGVtLm1vdW50KHJlZkl0ZW0pO1xuICAgICAgICBpdGVtLmFjdGl2YXRlKHRoaXMuZ2VuZXJhdGlvbklkKTtcbiAgICAgICAgdGhpcy5pdGVtcy5zZXQoa2V5LCBpdGVtKTtcblxuICAgICAgICByZXR1cm4gaXRlbTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbW92ZVN0YWxlSXRlbXMoKSB7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgaXRlbV0gb2YgdGhpcy5pdGVtcy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgIGlmIChpdGVtLmdlbmVyYXRpb25JZCA9PT0gdGhpcy5nZW5lcmF0aW9uSWQpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaXRlbS5kZWFjdGl2YXRlKCk7XG4gICAgICAgICAgICBpdGVtLnVubW91bnQoKTtcbiAgICAgICAgICAgIHRoaXMuaXRlbXMuZGVsZXRlKGtleSk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLAogICAgImltcG9ydCB7IG1hcE9ic2VydmFibGUsIHR5cGUgT2JzZXJ2YWJsZSB9IGZyb20gXCIuLi9vYnNlcnZhYmxlc1wiO1xuaW1wb3J0IHsgdG9SZWFjdGl2ZU5vZGUsIHR5cGUgUmVhY3RpdmVOb2RlIH0gZnJvbSBcIi4uL3JlYWN0aXZlL2V4dGVuc2lvbnNcIjtcbmltcG9ydCB7XG4gICAgUmVhY3RpdmVJdGVtQ29sbGVjdGlvbixcbiAgICB0eXBlIEJ1aWxkRm4sXG4gICAgdHlwZSBDb2xsZWN0aW9uLFxuICAgIHR5cGUgS2V5LFxuICAgIHR5cGUgS2V5Rm5cbn0gZnJvbSBcIi4vaXRlcmFibGUvY29sbGVjdGlvblwiO1xuXG50eXBlIFNvdXJjZTxUPiA9IENvbGxlY3Rpb248VD4gfCBFdmVudDxUPjtcblxuZXhwb3J0IHR5cGUgRXZlbnQ8VD4gPVxuICAgIHsgdHlwZTogXCJyZXBsYWNlXCIsIGl0ZW1zOiBDb2xsZWN0aW9uPFQ+IH0gfFxuICAgIHsgdHlwZTogXCJyZW1vdmVcIiwgaXRlbXM6IENvbGxlY3Rpb248VD4gfSB8XG4gICAgeyB0eXBlOiBcImFwcGVuZFwiLCBpdGVtczogQ29sbGVjdGlvbjxUPiB9IHxcbiAgICB7IHR5cGU6IFwicmVwbGFjZUtleXNcIiwgaXRlbXM6IENvbGxlY3Rpb248VD4gfTtcblxuZXhwb3J0IGNvbnN0IGl0ZXJhYmxlID0gPEsgZXh0ZW5kcyBLZXksIFQsIE4gZXh0ZW5kcyBSZWFjdGl2ZU5vZGU8Tm9kZT4+KFxuICAgIHsgaXQkLCBidWlsZEZuLCBrZXlGbiB9OiB7XG4gICAgICAgIGl0JDogT2JzZXJ2YWJsZTxTb3VyY2U8VD4+LFxuICAgICAgICBidWlsZEZuOiBCdWlsZEZuPE4sIFQ+LFxuICAgICAgICBrZXlGbjogS2V5Rm48SywgVD5cbiAgICB9XG4pOiBSZWFjdGl2ZU5vZGU8Q29tbWVudD4gPT4gbmV3IEl0ZXJhYmxlPEssIFQsIE4+KFxuICAgIGl0JCxcbiAgICBidWlsZEZuLFxuICAgIGtleUZuXG4pLnRvUmVhY3RpdmVOb2RlKCk7XG5cbmNsYXNzIEl0ZXJhYmxlPEsgZXh0ZW5kcyBLZXksIFQsIE4gZXh0ZW5kcyBSZWFjdGl2ZU5vZGU8Tm9kZT4+IHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlkID0gU3ltYm9sKCdJdGVyYWJsZScpO1xuICAgIHByaXZhdGUgaXQkOiBPYnNlcnZhYmxlPEV2ZW50PFQ+PjtcbiAgICBwcml2YXRlIGl0ZW1zOiBSZWFjdGl2ZUl0ZW1Db2xsZWN0aW9uPEssIFQsIE4+O1xuXG4gICAgY29uc3RydWN0b3IoXG4gICAgICAgIGl0JDogT2JzZXJ2YWJsZTxTb3VyY2U8VD4+LFxuICAgICAgICBidWlsZEZuOiBCdWlsZEZuPE4sIFQ+LFxuICAgICAgICBrZXlGbjogS2V5Rm48SywgVD5cbiAgICApIHtcbiAgICAgICAgdGhpcy5pdCQgPSB0aGlzLnRvRXZlbnRPYnNlcnZhYmxlKGl0JCk7XG4gICAgICAgIHRoaXMuaXRlbXMgPSBuZXcgUmVhY3RpdmVJdGVtQ29sbGVjdGlvbihrZXlGbiwgYnVpbGRGbik7XG4gICAgfVxuXG4gICAgdG9SZWFjdGl2ZU5vZGUoKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LmNyZWF0ZUNvbW1lbnQoJ0l0ZXJhYmxlJyk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZUZuID0gKGV2ZW50OiBFdmVudDxUPikgPT4ge1xuICAgICAgICAgICAgc3dpdGNoIChldmVudC50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBcInJlcGxhY2VcIjpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMucmVwbGFjZShhbmNob3IsIGV2ZW50Lml0ZW1zKTtcbiAgICAgICAgICAgICAgICBjYXNlIFwicmVwbGFjZUtleXNcIjpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMucmVwbGFjZUtleXMoYW5jaG9yLCBldmVudC5pdGVtcyk7XG4gICAgICAgICAgICAgICAgY2FzZSBcImFwcGVuZFwiOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5hcHBlbmQoYW5jaG9yLCBldmVudC5pdGVtcyk7XG4gICAgICAgICAgICAgICAgY2FzZSBcInJlbW92ZVwiOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5yZW1vdmUoZXZlbnQuaXRlbXMpO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjb25zb2xlLndhcm4oJ1Vuc3VwcG9ydGVkIGV2ZW50IHR5cGUnLCBldmVudCk7ICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB0b1JlYWN0aXZlTm9kZShhbmNob3IsIFt7XG4gICAgICAgICAgICBtb3VudDogKHBhcmVudE5vZGU6IE5vZGUpID0+IHBhcmVudE5vZGUuYXBwZW5kQ2hpbGQoYW5jaG9yKSxcbiAgICAgICAgICAgIGFjdGl2YXRlOiAoKSA9PiB0aGlzLml0JC5zdWJzY3JpYmVJbml0KHRoaXMuaWQsIHVwZGF0ZUZuKSxcbiAgICAgICAgICAgIGRlYWN0aXZhdGU6ICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLml0JC51bnN1YnNjcmliZSh0aGlzLmlkKTtcbiAgICAgICAgICAgICAgICB0aGlzLml0ZW1zLmRlYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1bm1vdW50OiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtcy51bm1vdW50KCk7XG4gICAgICAgICAgICAgICAgYW5jaG9yLnJlbW92ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0b0V2ZW50T2JzZXJ2YWJsZShpdCQ6IE9ic2VydmFibGU8U291cmNlPFQ+Pik6IE9ic2VydmFibGU8RXZlbnQ8VD4+IHtcbiAgICAgICAgcmV0dXJuIG1hcE9ic2VydmFibGUoKHNvdXJjZTogU291cmNlPFQ+KSA9PiB7XG4gICAgICAgICAgICBpZiAoc291cmNlIGluc3RhbmNlb2YgQXJyYXkgfHwgc291cmNlIGluc3RhbmNlb2YgTWFwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgdHlwZTogXCJyZXBsYWNlXCIsIGl0ZW1zOiBzb3VyY2UgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzb3VyY2U7XG4gICAgICAgIH0sIGl0JClcbiAgICB9XG59XG4iLAogICAgImltcG9ydCB7IHR5cGUgT2JzZXJ2YWJsZSB9IGZyb20gXCIuLi9vYnNlcnZhYmxlc1wiO1xuaW1wb3J0IHsgdG9SZWFjdGl2ZU5vZGUsIHR5cGUgUmVhY3RpdmVOb2RlIH0gZnJvbSBcIi4uL3JlYWN0aXZlL2V4dGVuc2lvbnNcIjtcblxudHlwZSBQYXJ0aWFsVGV4dE5vZGUgPSB7XG4gICAgc3RhdGljTm9kZXM6IFRleHRbXSxcbiAgICBkeW5hbWljTm9kZToge1xuICAgICAgICBub2RlOiBUZXh0LFxuICAgICAgICBvYnNlcnZlcklkOiBzeW1ib2wsXG4gICAgICAgIG9ic2VydmFibGU6IE9ic2VydmFibGU8c3RyaW5nPlxuICAgIH0gfCB1bmRlZmluZWRcbn07XG5cbnR5cGUgSG9sZSA9IE9ic2VydmFibGU8c3RyaW5nPiB8IHN0cmluZztcblxuZXhwb3J0IGNvbnN0IHRlbXBsYXRlID0gKFxuICAgIHN0cmluZ3M6IFRlbXBsYXRlU3RyaW5nc0FycmF5LFxuICAgIC4uLmhvbGVzOiBIb2xlW11cbik6IFJlYWN0aXZlTm9kZTxDb21tZW50PiA9PiBuZXcgVGVtcGxhdGUoc3RyaW5ncywgaG9sZXMpLnRvUmVhY3RpdmVOb2RlKCk7XG5cbmNsYXNzIFRlbXBsYXRlIHtcbiAgICBjb25zdHJ1Y3RvcihcbiAgICAgICAgcHJpdmF0ZSBzdHJpbmdzOiBUZW1wbGF0ZVN0cmluZ3NBcnJheSxcbiAgICAgICAgcHJpdmF0ZSBob2xlczogSG9sZVtdXG4gICAgKSB7IH1cblxuICAgIHRvUmVhY3RpdmVOb2RlKCk6IFJlYWN0aXZlTm9kZTxDb21tZW50PiB7XG4gICAgICAgIGNvbnN0IG5vZGVzID0gdGhpcy5idWlsZE5vZGVzKCk7XG4gICAgICAgIGNvbnN0IGNvbW1lbnROb2RlID0gZG9jdW1lbnQuY3JlYXRlQ29tbWVudCgnVGVtcGxhdGUnKTtcblxuICAgICAgICByZXR1cm4gdG9SZWFjdGl2ZU5vZGUoY29tbWVudE5vZGUsIFt7XG4gICAgICAgICAgICBtb3VudDogKHBhcmVudE5vZGU6IE5vZGUpID0+IHRoaXMuYXBwZW5kTm9kZXMocGFyZW50Tm9kZSwgbm9kZXMpLFxuICAgICAgICAgICAgYWN0aXZhdGU6ICgpID0+IHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHRoaXMuYXR0YWNoT2JzZXJ2YWJsZShub2RlKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWFjdGl2YXRlOiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB0aGlzLmRldGFjaE9ic2VydmFibGUobm9kZSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdW5tb3VudDogKCkgPT4gdGhpcy5yZW1vdmVOb2Rlcyhub2RlcyksXG4gICAgICAgIH1dKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJ1aWxkTm9kZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0cmluZ3MubWFwKChzdGF0aWNQYXJ0LCBpKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBob2xlID0gdGhpcy5ob2xlc1tpXTtcbiAgICAgICAgICAgIGNvbnN0IHBhcnRpYWxUZXh0Tm9kZTogUGFydGlhbFRleHROb2RlID0ge1xuICAgICAgICAgICAgICAgIHN0YXRpY05vZGVzOiBbZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoc3RhdGljUGFydCldLFxuICAgICAgICAgICAgICAgIGR5bmFtaWNOb2RlOiB1bmRlZmluZWRcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgaG9sZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBwYXJ0aWFsVGV4dE5vZGUuc3RhdGljTm9kZXMucHVzaChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShob2xlKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBob2xlID09PSAnb2JqZWN0JyAmJiBob2xlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcGFydGlhbFRleHROb2RlLmR5bmFtaWNOb2RlID0ge1xuICAgICAgICAgICAgICAgICAgICBub2RlOiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnJyksXG4gICAgICAgICAgICAgICAgICAgIG9ic2VydmVySWQ6IFN5bWJvbChgVGVtcGxhdGUke2l9YCksXG4gICAgICAgICAgICAgICAgICAgIG9ic2VydmFibGU6IGhvbGVcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcGFydGlhbFRleHROb2RlO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFwcGVuZE5vZGVzKHBhcmVudE5vZGU6IE5vZGUsIG5vZGVzOiBQYXJ0aWFsVGV4dE5vZGVbXSkge1xuICAgICAgICBmb3IgKGNvbnN0IHsgc3RhdGljTm9kZXMsIGR5bmFtaWNOb2RlIH0gb2Ygbm9kZXMpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qgc3RhdGljTm9kZSBvZiBzdGF0aWNOb2RlcylcbiAgICAgICAgICAgICAgICBwYXJlbnROb2RlLmFwcGVuZENoaWxkKHN0YXRpY05vZGUpO1xuICAgICAgICAgICAgaWYgKGR5bmFtaWNOb2RlICE9PSB1bmRlZmluZWQpIFxuICAgICAgICAgICAgICAgIHBhcmVudE5vZGUuYXBwZW5kQ2hpbGQoZHluYW1pY05vZGUubm9kZSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcHJpdmF0ZSBhdHRhY2hPYnNlcnZhYmxlKHBhcnRpYWxUZXh0Tm9kZTogUGFydGlhbFRleHROb2RlKSB7XG4gICAgICAgIGlmIChwYXJ0aWFsVGV4dE5vZGUgPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xuICAgICAgICBpZiAocGFydGlhbFRleHROb2RlLmR5bmFtaWNOb2RlID09PSB1bmRlZmluZWQpIHJldHVybjtcblxuICAgICAgICBjb25zdCB7IG5vZGUsIG9ic2VydmVySWQsIG9ic2VydmFibGUgfSA9IHBhcnRpYWxUZXh0Tm9kZS5keW5hbWljTm9kZTtcblxuICAgICAgICBvYnNlcnZhYmxlLnN1YnNjcmliZUluaXQob2JzZXJ2ZXJJZCwgKHZhbHVlKSA9PiBub2RlLmRhdGEgPSB2YWx1ZSk7XG4gICAgfTtcblxuICAgIHByaXZhdGUgcmVtb3ZlTm9kZXMobm9kZXM6IFBhcnRpYWxUZXh0Tm9kZVtdKSB7XG4gICAgICAgIGZvciAoY29uc3QgeyBzdGF0aWNOb2RlcywgZHluYW1pY05vZGUgfSBvZiBub2Rlcykge1xuICAgICAgICAgICAgZm9yIChjb25zdCBzdGF0aWNOb2RlIG9mIHN0YXRpY05vZGVzKVxuICAgICAgICAgICAgICAgIHN0YXRpY05vZGUucmVtb3ZlKCk7XG4gICAgICAgICAgICBpZiAoZHluYW1pY05vZGUgIT09IHVuZGVmaW5lZCkgZHluYW1pY05vZGUubm9kZS5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBwcml2YXRlIGRldGFjaE9ic2VydmFibGUobm9kZTogUGFydGlhbFRleHROb2RlKSB7XG4gICAgICAgIGlmIChub2RlLmR5bmFtaWNOb2RlID09PSB1bmRlZmluZWQpIHJldHVybjtcbiAgICAgICAgY29uc3QgeyBvYnNlcnZlcklkLCBvYnNlcnZhYmxlIH0gPSBub2RlLmR5bmFtaWNOb2RlO1xuICAgICAgICBvYnNlcnZhYmxlLnVuc3Vic2NyaWJlKG9ic2VydmVySWQpO1xuICAgIH07XG59XG4iLAogICAgImltcG9ydCB7IHJlYWN0aXZlVGV4dE5vZGUgfSBmcm9tICcuJztcbmltcG9ydCB7XG4gICAgdG9UYWdSZWFjdGl2ZU5vZGUsXG4gICAgdHlwZSBSZWFjdGl2ZU5vZGUsXG4gICAgdHlwZSBUYWdSZWFjdGl2ZU5vZGVcbn0gZnJvbSAnLi4vcmVhY3RpdmUvZXh0ZW5zaW9ucyc7XG5cbmV4cG9ydCB0eXBlIElucHV0Q2hpbGQ8XG4gICAgVCBleHRlbmRzIE5vZGUsXG4gICAgSyBleHRlbmRzIGtleW9mIEhUTUxFbGVtZW50VGFnTmFtZU1hcCA9IGtleW9mIEhUTUxFbGVtZW50VGFnTmFtZU1hcFxuPiA9IFRhZ1JlYWN0aXZlTm9kZTxLPiB8IFJlYWN0aXZlTm9kZTxUPiB8IHN0cmluZztcblxuZXhwb3J0IGNvbnN0IHRhZyA9IDxcbiAgICBLIGV4dGVuZHMga2V5b2YgSFRNTEVsZW1lbnRUYWdOYW1lTWFwXG4+KG5hbWU6IEssIC4uLmlucHV0Q2hpbGRyZW46IElucHV0Q2hpbGQ8Tm9kZT5bXSk6IFRhZ1JlYWN0aXZlTm9kZTxLPiA9PiB7XG4gICAgY29uc3Qgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQobmFtZSk7XG4gICAgY29uc3QgY2hpbGRyZW46IFJlYWN0aXZlTm9kZTxOb2RlPltdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGlucHV0Q2hpbGRyZW4pIHtcbiAgICAgICAgaWYgKHR5cGVvZiAoY2hpbGQpID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY2hpbGRyZW4ucHVzaChyZWFjdGl2ZVRleHROb2RlKGNoaWxkKSk7XG4gICAgICAgIH0gZWxzZSBpZiAoY2hpbGQgaW5zdGFuY2VvZiBOb2RlKSB7XG4gICAgICAgICAgICBjaGlsZHJlbi5wdXNoKGNoaWxkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgY2hpbGQgdHlwZScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvVGFnUmVhY3RpdmVOb2RlPEs+KG5vZGUsIFt7XG4gICAgICAgIG1vdW50OiAocGFyZW50Tm9kZTogTm9kZSkgPT4ge1xuICAgICAgICAgICAgcGFyZW50Tm9kZS5hcHBlbmRDaGlsZChub2RlKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIGNoaWxkLm1vdW50KG5vZGUpO1xuICAgICAgICB9LFxuICAgICAgICBhY3RpdmF0ZTogKCkgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikgY2hpbGQuYWN0aXZhdGUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgZGVhY3RpdmF0ZTogKCkgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikgY2hpbGQuZGVhY3RpdmF0ZSgpO1xuICAgICAgICB9LFxuICAgICAgICB1bm1vdW50OiAoKSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSBjaGlsZC51bm1vdW50KCk7XG4gICAgICAgICAgICBub2RlLnJlbW92ZSgpO1xuICAgICAgICB9XG4gICAgfV0pO1xufVxuXG5leHBvcnQgY29uc3QgdGFncyA9IHtcbiAgICBpbWc6IChzcmM6IHN0cmluZyk6IFRhZ1JlYWN0aXZlTm9kZTwnaW1nJz4gPT4gdGFnKCdpbWcnKS5hdHQoJ3NyYycsIHNyYyksXG4gICAgaW5wdXQ6ICh0eXBlOiBzdHJpbmcpOiBUYWdSZWFjdGl2ZU5vZGU8J2lucHV0Jz4gPT4gdGFnKCdpbnB1dCcpLmF0dCgndHlwZScsIHR5cGUpLFxuICAgIGNhbnZhczogPFQgZXh0ZW5kcyBJbnB1dENoaWxkPE5vZGU+W10+KC4uLmNoaWxkcmVuOiBUKTogVGFnUmVhY3RpdmVOb2RlPCdjYW52YXMnPiA9PiB0YWcoJ2NhbnZhcycsIC4uLmNoaWxkcmVuKSxcbiAgICBidXR0b246IDxUIGV4dGVuZHMgSW5wdXRDaGlsZDxOb2RlPltdPiguLi5jaGlsZHJlbjogVCk6IFRhZ1JlYWN0aXZlTm9kZTwnYnV0dG9uJz4gPT4gdGFnKCdidXR0b24nLCAuLi5jaGlsZHJlbiksXG4gICAgaDE6IDxUIGV4dGVuZHMgSW5wdXRDaGlsZDxOb2RlPltdPiguLi5jaGlsZHJlbjogVCk6IFRhZ1JlYWN0aXZlTm9kZTwnaDEnPiA9PiB0YWcoJ2gxJywgLi4uY2hpbGRyZW4pLFxuICAgIGgyOiA8VCBleHRlbmRzIElucHV0Q2hpbGQ8Tm9kZT5bXT4oLi4uY2hpbGRyZW46IFQpOiBUYWdSZWFjdGl2ZU5vZGU8J2gyJz4gPT4gdGFnKCdoMicsIC4uLmNoaWxkcmVuKSxcbiAgICBoMzogPFQgZXh0ZW5kcyBJbnB1dENoaWxkPE5vZGU+W10+KC4uLmNoaWxkcmVuOiBUKTogVGFnUmVhY3RpdmVOb2RlPCdoMyc+ID0+IHRhZygnaDMnLCAuLi5jaGlsZHJlbiksXG4gICAgcDogPFQgZXh0ZW5kcyBJbnB1dENoaWxkPE5vZGU+W10+KC4uLmNoaWxkcmVuOiBUKTogVGFnUmVhY3RpdmVOb2RlPCdwJz4gPT4gdGFnKCdwJywgLi4uY2hpbGRyZW4pLFxuICAgIGE6IDxUIGV4dGVuZHMgSW5wdXRDaGlsZDxOb2RlPltdPiguLi5jaGlsZHJlbjogVCk6IFRhZ1JlYWN0aXZlTm9kZTwnYSc+ID0+IHRhZygnYScsIC4uLmNoaWxkcmVuKSxcbiAgICBkaXY6IDxUIGV4dGVuZHMgSW5wdXRDaGlsZDxOb2RlPltdPiguLi5jaGlsZHJlbjogVCk6IFRhZ1JlYWN0aXZlTm9kZTwnZGl2Jz4gPT4gdGFnKCdkaXYnLCAuLi5jaGlsZHJlbiksXG4gICAgdWw6IDxUIGV4dGVuZHMgSW5wdXRDaGlsZDxOb2RlPltdPiguLi5jaGlsZHJlbjogVCk6IFRhZ1JlYWN0aXZlTm9kZTwndWwnPiA9PiB0YWcoJ3VsJywgLi4uY2hpbGRyZW4pLFxuICAgIGxpOiA8VCBleHRlbmRzIElucHV0Q2hpbGQ8Tm9kZT5bXT4oLi4uY2hpbGRyZW46IFQpOiBUYWdSZWFjdGl2ZU5vZGU8J2xpJz4gPT4gdGFnKCdsaScsIC4uLmNoaWxkcmVuKSxcbiAgICBzcGFuOiA8VCBleHRlbmRzIElucHV0Q2hpbGQ8Tm9kZT5bXT4oLi4uY2hpbGRyZW46IFQpOiBUYWdSZWFjdGl2ZU5vZGU8J3NwYW4nPiA9PiB0YWcoJ3NwYW4nLCAuLi5jaGlsZHJlbiksXG4gICAgc2VsZWN0OiA8VCBleHRlbmRzIElucHV0Q2hpbGQ8Tm9kZT5bXT4oLi4uY2hpbGRyZW46IFQpOiBUYWdSZWFjdGl2ZU5vZGU8J3NlbGVjdCc+ID0+IHRhZygnc2VsZWN0JywgLi4uY2hpbGRyZW4pLFxuICAgIG9wdGlvbjogPFQgZXh0ZW5kcyBJbnB1dENoaWxkPE5vZGU+W10+KC4uLmNoaWxkcmVuOiBUKTogVGFnUmVhY3RpdmVOb2RlPCdvcHRpb24nPiA9PiB0YWcoJ29wdGlvbicsIC4uLmNoaWxkcmVuKVxufTtcbiIsCiAgICAiZXhwb3J0IHR5cGUgVGFzayA9ICgpID0+IHZvaWQ7XG5leHBvcnQgdHlwZSBUYXNrUnVubmVyID0gKHRhc2s6IFRhc2spID0+IHZvaWQ7XG5cbmV4cG9ydCBjb25zdCBidWlsZE1pY3JvdGFza1J1bm5lciA9ICgpOiBUYXNrUnVubmVyID0+IHtcbiAgICBjb25zdCB0YXNrczogVGFza1tdID0gW107XG4gICAgY29uc3QgZW5xdWV1ZSA9ICgpID0+IHF1ZXVlTWljcm90YXNrKCgpID0+IHtcbiAgICAgICAgY29uc3QgcnVuID0gdGFza3MudG9SZXZlcnNlZCgpO1xuICAgICAgICB0YXNrcy5sZW5ndGggPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgcnVuKSB0YXNrKCk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gKHRhc2s6IFRhc2spID0+IHtcbiAgICAgICAgdGFza3MucHVzaCh0YXNrKTtcbiAgICAgICAgaWYgKHRhc2tzLmxlbmd0aCA9PSAxKSBlbnF1ZXVlKCk7XG4gICAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBtaWNyb3Rhc2tSdW5uZXI6IFRhc2tSdW5uZXIgPSBidWlsZE1pY3JvdGFza1J1bm5lcigpO1xuIiwKICAgICJpbXBvcnQgeyB0b1JlYWN0aXZlTm9kZSwgdHlwZSBSZWFjdGl2ZU5vZGUgfSBmcm9tIFwiLi9yZWFjdGl2ZVwiO1xuaW1wb3J0IHsgbWljcm90YXNrUnVubmVyIH0gZnJvbSBcIi4vdGFza1wiO1xuXG50eXBlIFJvdXRlS2V5PFQgZXh0ZW5kcyBSb3V0ZUNvbGxlY3Rpb248Tm9kZT4+ID0ga2V5b2YgVCAmIHN0cmluZztcbnR5cGUgUm91dGU8VCBleHRlbmRzIFJvdXRlQ29sbGVjdGlvbjxOb2RlPj4gPSBUW1JvdXRlS2V5PFQ+XTtcbnR5cGUgUm91dGVDb2xsZWN0aW9uPE4gZXh0ZW5kcyBOb2RlPiA9IFJlY29yZDxzdHJpbmcsIFJlYWN0aXZlTm9kZTxOPj47XG50eXBlIFJvdXRlck9wdHM8VCBleHRlbmRzIFJvdXRlQ29sbGVjdGlvbjxOb2RlPj4gPSB7XG4gICAgbm90Rm91bmRSb3V0ZTogUm91dGVLZXk8VD47XG59O1xuXG5leHBvcnQgY29uc3Qgcm91dGVyID0gPFxuICAgIFQgZXh0ZW5kcyBSb3V0ZUNvbGxlY3Rpb248Tm9kZT5cbj4ocm91dGVzOiBULCBvcHRzOiBSb3V0ZXJPcHRzPFQ+KTogUmVhY3RpdmVOb2RlPENvbW1lbnQ+ID0+IFxuICAgIG5ldyBSb3V0ZXI8VD4ocm91dGVzLCBvcHRzKS50b1JlYWN0aXZlTm9kZSgpO1xuXG5jbGFzcyBSb3V0ZXI8VCBleHRlbmRzIFJvdXRlQ29sbGVjdGlvbjxOb2RlPj4ge1xuICAgIHByaXZhdGUgYW5jaG9yOiBDb21tZW50IHwgdW5kZWZpbmVkO1xuICAgIHByaXZhdGUgY3VycmVudFJvdXRlOiBSb3V0ZTxUPiB8IHVuZGVmaW5lZDtcbiAgICBwcml2YXRlIGhhc2hDaGFuZ2VMaXN0ZW5lciA9ICgpID0+IHRoaXMuc3luY0hhc2goKTtcblxuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgICBwcml2YXRlIHJvdXRlczogVCxcbiAgICAgICAgcHJpdmF0ZSBvcHRzOiBSb3V0ZXJPcHRzPFQ+XG4gICAgKSB7IH1cblxuICAgIHRvUmVhY3RpdmVOb2RlKCkge1xuICAgICAgICBjb25zdCBhbmNob3IgPSBkb2N1bWVudC5jcmVhdGVDb21tZW50KCdSb3V0ZXInKTtcblxuICAgICAgICByZXR1cm4gdG9SZWFjdGl2ZU5vZGUoYW5jaG9yLCBbe1xuICAgICAgICAgICAgbW91bnQ6IChwYXJlbnROb2RlOiBIVE1MRWxlbWVudCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmFuY2hvciAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY29uc29sZS53YXJuKFwiUm91dGVyIGlzIGFscmVhZHkgYWN0aXZlXCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuYW5jaG9yID0gYW5jaG9yO1xuICAgICAgICAgICAgICAgIHBhcmVudE5vZGUuYXBwZW5kQ2hpbGQoYW5jaG9yKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhY3RpdmF0ZTogKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc3luY0hhc2goKTtcbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImhhc2hjaGFuZ2VcIiwgdGhpcy5oYXNoQ2hhbmdlTGlzdGVuZXIpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGRlYWN0aXZhdGU6ICgpID0+IHtcbiAgICAgICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImhhc2hjaGFuZ2VcIiwgdGhpcy5oYXNoQ2hhbmdlTGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFJvdXRlPy5kZWFjdGl2YXRlKCk7ICAgICAgICAgXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdW5tb3VudDogKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFJvdXRlPy51bm1vdW50KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Um91dGUgPSB1bmRlZmluZWQ7ICBcbiAgICAgICAgICAgICAgICBhbmNob3IucmVtb3ZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1dKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN5bmNIYXNoKCkge1xuICAgICAgICBjb25zdCBuZXdSb3V0ZSA9IHRoaXMuZ2V0TmV3Um91dGUoKTtcblxuICAgICAgICBpZiAobmV3Um91dGUgPT09IHRoaXMuY3VycmVudFJvdXRlIHx8IG5ld1JvdXRlID09PSB1bmRlZmluZWQpIHJldHVybjtcblxuICAgICAgICB0aGlzLmN1cnJlbnRSb3V0ZT8uZGVhY3RpdmF0ZSgpO1xuICAgICAgICB0aGlzLmN1cnJlbnRSb3V0ZT8udW5tb3VudCgpO1xuICAgICAgICB0aGlzLmN1cnJlbnRSb3V0ZSA9IG5ld1JvdXRlO1xuXG4gICAgICAgIG1pY3JvdGFza1J1bm5lcigoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRFbGVtZW50ID0gdGhpcy5hbmNob3I/LnBhcmVudEVsZW1lbnQ7XG4gICAgICAgICAgICBpZiAocGFyZW50RWxlbWVudCA9PT0gbnVsbCB8fCBwYXJlbnRFbGVtZW50ID09PSB1bmRlZmluZWQpIHJldHVybjtcbiAgICAgICAgICAgIG5ld1JvdXRlLm1vdW50KHBhcmVudEVsZW1lbnQpO1xuICAgICAgICAgICAgbmV3Um91dGUuYWN0aXZhdGUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXROZXdSb3V0ZSgpOiBSb3V0ZTxUPiB8IHVuZGVmaW5lZCB7XG4gICAgICAgIGNvbnN0IGhhc2hMb2NhdGlvbiA9IGxvY2F0aW9uLmhhc2guc2xpY2UoMSkgfHwgXCIvXCI7XG5cbiAgICAgICAgY29uc3Qgcm91dGVLZXk6IFJvdXRlS2V5PFQ+ID0gdGhpcy5pc1JvdXRlS2V5KGhhc2hMb2NhdGlvbilcbiAgICAgICAgICAgID8gaGFzaExvY2F0aW9uXG4gICAgICAgICAgICA6IHRoaXMub3B0cy5ub3RGb3VuZFJvdXRlO1xuXG4gICAgICAgIHJldHVybiB0aGlzLnJvdXRlc1tyb3V0ZUtleV07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpc1JvdXRlS2V5KGtleTogc3RyaW5nKToga2V5IGlzIFJvdXRlS2V5PFQ+IHtcbiAgICAgICAgcmV0dXJuIGtleSBpbiB0aGlzLnJvdXRlcztcbiAgICB9XG59XG4iLAogICAgImltcG9ydCB7XG4gICAgb2JzZXJ2YWJsZSxcbiAgICBjb25kLFxuICAgIHRlbXBsYXRlLFxuICAgIGl0ZXJhYmxlLFxuICAgIGNvbXBvbmVudCxcbiAgICBtYXBPYnNlcnZhYmxlLFxuICAgIHJvdXRlcixcbiAgICB0YWdzLFxuICAgIGRlZHVwT2JzZXJ2YWJsZSxcbiAgICB0YWcsXG4gICAgb25jZVxufSBmcm9tIFwiLlwiO1xuXG5pbXBvcnQgeyBSZWFjdGl2ZUFycmF5IH0gZnJvbSBcIi5cIjtcblxuY29uc3QgTE9SRU0gPSBgXG4gICAgICBMb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldCwgY29uc2VjdGV0dXIgYWRpcGlzY2luZyBlbGl0LCBzZWQgZG8gZWl1c21vZCB0ZW1wb3IgaW5jaWRpZHVudCB1dCBsYWJvcmUgZXQgZG9sb3JlIG1hZ25hIGFsaXF1YS5cbiAgICAgIFV0IGVuaW0gYWQgbWluaW0gdmVuaWFtLCBxdWlzIG5vc3RydWQgZXhlcmNpdGF0aW9uIHVsbGFtY28gbGFib3JpcyBuaXNpIHV0IGFsaXF1aXAgZXggZWEgY29tbW9kbyBjb25zZXF1YXQuXG4gICAgICBEdWlzIGF1dGUgaXJ1cmUgZG9sb3IgaW4gcmVwcmVoZW5kZXJpdCBpbiB2b2x1cHRhdGUgdmVsaXQgZXNzZSBjaWxsdW0gZG9sb3JlIGV1IGZ1Z2lhdCBudWxsYSBwYXJpYXR1ci5cbiAgICAgIEV4Y2VwdGV1ciBzaW50IG9jY2FlY2F0IGN1cGlkYXRhdCBub24gcHJvaWRlbnQsIHN1bnQgaW4gY3VscGEgcXVpIG9mZmljaWEgZGVzZXJ1bnQgbW9sbGl0IGFuaW0gaWQgZXN0IGxhYm9ydW0uYDtcblxuY29uc3QgeyBhLCBwLCBoMSwgaDIsIGRpdiwgc3BhbiwgYnV0dG9uLCB1bCwgbGksIGltZywgaW5wdXQgfSA9IHRhZ3M7XG5cbmNvbnN0IHNob3BwaW5nSXRlbXMgPSBuZXcgUmVhY3RpdmVBcnJheShbXG4gICAgeyBuYW1lOiBcIm1pbGtcIiwgcHJpY2UkOiBvYnNlcnZhYmxlKFwiMS45OVwiKSB9LFxuICAgIHsgbmFtZTogXCJzb3VyIGNyZWFtXCIsIHByaWNlJDogb2JzZXJ2YWJsZShcIjIuOTlcIikgfSxcbiAgICB7IG5hbWU6IFwiY2hlZXNlXCIsIHByaWNlJDogb2JzZXJ2YWJsZShcIjAuOTlcIikgfVxuXSk7XG5cbmNvbnN0IGNvdW50ZXIgPSAoKSA9PiBjb21wb25lbnQoe1xuICAgIGNhY2hlOiB0cnVlLFxuICAgIHByb3BzOiB7IGNvdW50ZXI6IFwiQ291bnRlclwiIH0sXG4gICAgb2JzZXJ2YWJsZXM6ICgpID0+ICh7XG4gICAgICAgIGNvdW50JDogb2JzZXJ2YWJsZSgwKSxcbiAgICAgICAgaGFyZCQ6IG9ic2VydmFibGUoZmFsc2UpLFxuICAgICAgICB2ZXJ5SGFyZCQ6IG9ic2VydmFibGUodHJ1ZSlcbiAgICB9KSxcbiAgICBkZXJpdmVkT2JzZXJ2YWJsZXM6ICh7IGNvdW50JCwgaGFyZCQgfSkgPT4gKHtcbiAgICAgICAgaW1hZ2VTb3VyY2UkOiBtYXBPYnNlcnZhYmxlKFxuICAgICAgICAgICAgKGhhcmQpID0+IGhhcmQgPyBcIkthc2hhSGFyZC5naWZcIiA6IFwiS2FzaGEucG5nXCIsXG4gICAgICAgICAgICBkZWR1cE9ic2VydmFibGUoaGFyZCQpKSxcbiAgICAgICAgaGV4Q291bnRlciQ6IG1hcE9ic2VydmFibGUoKHgpID0+IHgudG9TdHJpbmcoMTYpLCBjb3VudCQpXG4gICAgfSksXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoeyBjb3VudCQsIGhhcmQkLCB2ZXJ5SGFyZCQsIGltYWdlU291cmNlJCwgaGV4Q291bnRlciQgfSkge1xuICAgICAgICBjb25zdCBvbkNsaWNrID0gKCkgPT4ge1xuICAgICAgICAgICAgY291bnQkLnVwZGF0ZSgoY291bnQpID0+IGNvdW50ICsgMSk7XG4gICAgICAgICAgICBoYXJkJC51cGRhdGUoKGhhcmQpID0+ICFoYXJkKTtcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gZGl2KFxuICAgICAgICAgICAgaDIoY29uZCh7XG4gICAgICAgICAgICAgICAgaWYkOiBtYXBPYnNlcnZhYmxlKFxuICAgICAgICAgICAgICAgICAgICAoaGFyZCwgdmVyeUhhcmQpID0+IGhhcmQgJiYgdmVyeUhhcmQsIGhhcmQkLCB2ZXJ5SGFyZCQpLFxuICAgICAgICAgICAgICAgIHRoZW46IFwiUm9jayBoYXJkLCBiYWJ5XCIsXG4gICAgICAgICAgICAgICAgb3RoZXJ3aXNlOiBcIldvb2QgbmVlZGVkXCJcbiAgICAgICAgICAgIH0pKSxcbiAgICAgICAgICAgIGRpdihzcGFuKHRlbXBsYXRlYCR7dGhpcy5wcm9wcy5jb3VudGVyfTogJHtoZXhDb3VudGVyJH1gKSksXG4gICAgICAgICAgICBkaXYoaW1nKFwiS2FzaGEucG5nXCIpLmF0dCQoXCJzcmNcIiwgaW1hZ2VTb3VyY2UkKS5jbGsob25DbGljaykpXG4gICAgICAgICk7XG4gICAgfVxufSk7XG5cbmNvbnN0IHNob3BwaW5nRm9ybSA9ICgpID0+IGNvbXBvbmVudCh7XG4gICAgb2JzZXJ2YWJsZXM6ICgpID0+ICh7XG4gICAgICAgIG5hbWUkOiBvYnNlcnZhYmxlKCcnKSxcbiAgICAgICAgcHJpY2UkOiBvYnNlcnZhYmxlKCcnKSxcbiAgICB9KSxcbiAgICBkZXJpdmVkT2JzZXJ2YWJsZXM6ICh7IG5hbWUkLCBwcmljZSQgfSkgPT4gKHtcbiAgICAgICAgZm9ybUludmFsaWQkOlxuICAgICAgICAgICAgbWFwT2JzZXJ2YWJsZSgobmFtZSwgcHJpY2UpID0+ICEhIW5hbWUgfHwgISEhcHJpY2UsIG5hbWUkLCBwcmljZSQpXG4gICAgfSksXG4gICAgcmVuZGVyOiAoeyBuYW1lJCwgcHJpY2UkLCBmb3JtSW52YWxpZCQgfSkgPT4gZGl2KFxuICAgICAgICBjb25kKHtcbiAgICAgICAgICAgIGlmJDogZm9ybUludmFsaWQkLFxuICAgICAgICAgICAgb3RoZXJ3aXNlOiAoKSA9PiBkaXYodGFnKCdoNCcsIHRlbXBsYXRlYFBlbmRpbmcgaXRlbTogJHtuYW1lJH0gOiAke3ByaWNlJH1gKSlcbiAgICAgICAgfSksXG4gICAgICAgIGRpdihzcGFuKCdOYW1lOiAnKSwgaW5wdXQoJ3RleHQnKS5hdHQoJ2lkJywgJ2l0ZW1OYW1lJykubW9kZWwkKG5hbWUkKSksXG4gICAgICAgIGRpdihzcGFuKCdQcmljZTogJyksIGlucHV0KCd0ZXh0JykuYXR0KCdpZCcsICdpdGVtUHJpY2UnKS5tb2RlbCQocHJpY2UkKSksXG4gICAgICAgIGJ1dHRvbihzcGFuKCdBZGQnKSkucHJvcCQoJ2Rpc2FibGVkJywgZm9ybUludmFsaWQkKS5jbGsoKCkgPT4ge1xuICAgICAgICAgICAgb25jZSgobmFtZSwgcHJpY2UpID0+IHtcbiAgICAgICAgICAgICAgICBzaG9wcGluZ0l0ZW1zLnB1c2goeyBuYW1lLCBwcmljZSQ6IG9ic2VydmFibGUocHJpY2UpIH0pO1xuICAgICAgICAgICAgICAgIG5hbWUkLnVwZGF0ZSgoXykgPT4gXCJcIik7XG4gICAgICAgICAgICAgICAgcHJpY2UkLnVwZGF0ZSgoXykgPT4gXCJcIik7XG4gICAgICAgICAgICB9LCBuYW1lJCwgcHJpY2UkKTtcbiAgICAgICAgfSlcbiAgICApXG59KTtcblxuY29uc3Qgc2hvcHBpbmdMaXN0ID0gKCkgPT4gY29tcG9uZW50KHtcbiAgICBvYnNlcnZhYmxlczogKCkgPT4gKHsgc2hvcHBpbmdJdGVtcyQ6IHNob3BwaW5nSXRlbXMub2JzZXJ2YWJsZSQgfSksXG4gICAgcmVuZGVyOiAoeyBzaG9wcGluZ0l0ZW1zJCB9KSA9PiBkaXYoXG4gICAgICAgIGgyKFwiU2hvcHBpbmcgaXRlbXNcIiksXG4gICAgICAgIHVsKFxuICAgICAgICAgICAgaXRlcmFibGUoe1xuICAgICAgICAgICAgICAgIGl0JDogc2hvcHBpbmdJdGVtcyQsXG4gICAgICAgICAgICAgICAgYnVpbGRGbjogKF8sIGl0ZW0pID0+IGxpKHNwYW4odGVtcGxhdGVgJHtpdGVtLm5hbWV9IC0gJHtpdGVtLnByaWNlJH1gKSksXG4gICAgICAgICAgICAgICAga2V5Rm46IChfLCBpdGVtKSA9PiBpdGVtLm5hbWUsXG4gICAgICAgICAgICB9KVxuICAgICAgICApXG4gICAgKVxufSk7XG5cbmNvbnN0IGV4YW1wbGVSb3V0ZXIgPSByb3V0ZXIoe1xuICAgIFwiL1wiOiBkaXYoXG4gICAgICAgIGgxKFwiUmVhY3RpdmVcIiksXG4gICAgICAgIGRpdihhKFwiRm9vXCIpLmF0dChcImhyZWZcIiwgXCIjL2Zvb1wiKSksXG4gICAgICAgIGRpdihhKFwiQmFyXCIpLmF0dChcImhyZWZcIiwgXCIjL2JhclwiKSksXG4gICAgICAgIGNvdW50ZXIoKSxcbiAgICAgICAgc2hvcHBpbmdMaXN0KCksXG4gICAgICAgIHNob3BwaW5nRm9ybSgpXG4gICAgKSxcbiAgICBcIi9mb29cIjogY29tcG9uZW50KHtcbiAgICAgICAgb2JzZXJ2YWJsZXM6ICgpID0+ICh7IGNvdW50JDogb2JzZXJ2YWJsZSgwKSB9KSxcbiAgICAgICAgZGVyaXZlZE9ic2VydmFibGVzOiAoeyBjb3VudCQgfSkgPT4gKHtcbiAgICAgICAgICAgIHBhcmFncmFwaFN0eWxlJDogbWFwT2JzZXJ2YWJsZShcbiAgICAgICAgICAgICAgICAoY291bnQpID0+IGBjb2xvcjogJHtudW1iZXJUb0hleENvbG9yKGNvdW50ICogOTk5OTk5KX1gLCBjb3VudCQpXG4gICAgICAgIH0pLFxuICAgICAgICByZW5kZXI6ICh7IGNvdW50JCwgcGFyYWdyYXBoU3R5bGUkIH0pID0+IGRpdihcbiAgICAgICAgICAgIGgxKFwiRm9vXCIpLFxuICAgICAgICAgICAgcChMT1JFTSkuYXR0JChcInN0eWxlXCIsIHBhcmFncmFwaFN0eWxlJCksXG4gICAgICAgICAgICBidXR0b24oXCJDaGFuZ2UgY29sb3JcIikuY2xrKCgpID0+IGNvdW50JC51cGRhdGUoKHgpID0+IHggKyAxKSksXG4gICAgICAgICAgICBkaXYoYShcIkhvbWVcIikuYXR0KFwiaHJlZlwiLCBcIiNcIikpLFxuICAgICAgICApXG4gICAgfSksXG4gICAgXCIvYmFyXCI6IGRpdihcbiAgICAgICAgaDEoXCJCYXJcIiksXG4gICAgICAgIHAoTE9SRU0pLFxuICAgICAgICBkaXYoYShcIkhvbWVcIikuYXR0KFwiaHJlZlwiLCBcIiNcIikpXG4gICAgKVxufSwgeyBub3RGb3VuZFJvdXRlOiBcIi9cIiB9KTtcblxuZnVuY3Rpb24gbnVtYmVyVG9IZXhDb2xvcihudW1iZXI6IG51bWJlcikge1xuICAgIGxldCBoZXggPSAobnVtYmVyICUgMHhmZmZmZmYpLnRvU3RyaW5nKDE2KTtcbiAgICB3aGlsZSAoaGV4Lmxlbmd0aCA8IDYpIGhleCA9IFwiMFwiICsgaGV4O1xuICAgIHJldHVybiBcIiNcIiArIGhleDtcbn1cblxuZXhhbXBsZVJvdXRlci5tb3VudChkb2N1bWVudC5i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QUFvQixHQUFHLGNBQWM7QUFBQSxNQUNqQyxpQkFBaUIsY0FDYixDQUFDLFVBQVUsVUFBVSxpQkFBaUIsUUFBUSxNQUFNLEtBQUssTUFBTTtBQUFBLElBQ3ZFO0FBQUEsSUFDQSxRQUFRLEdBQUcsUUFBUSxzQkFBc0IsSUFDckMsR0FBRyxLQUFLLEdBQ1IsRUFBRSxLQUFLLEVBQUUsS0FBSyxTQUFTLGVBQWUsR0FDdEMsT0FBTyxjQUFjLEVBQUUsSUFBSSxNQUFNLE9BQU8sT0FBTyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsR0FDNUQsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQ2xDO0FBQUEsRUFDSixDQUFDO0FBQUEsRUFDRCxRQUFRLElBQ0osR0FBRyxLQUFLLEdBQ1IsRUFBRSxLQUFLLEdBQ1AsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQ2xDO0FBQ0osR0FBRyxFQUFFLGVBQWUsSUFBSSxDQUFDO0FBRXpCLFNBQVMsZ0JBQWdCLENBQUMsUUFBZ0I7QUFBQSxFQUN0QyxJQUFJLE9BQU8sU0FBUyxVQUFVLFNBQVMsRUFBRTtBQUFBLEVBQ3pDLE9BQU8sSUFBSSxTQUFTO0FBQUEsSUFBRyxNQUFNLE1BQU07QUFBQSxFQUNuQyxPQUFPLE1BQU07QUFBQTtBQUdqQixjQUFjLE1BQU0sU0FBUyxJQUFJO0FBQ2pDLGNBQWMsU0FBUzsiLAogICJkZWJ1Z0lkIjogIkQ1NTdFOERGNDM1OTBFNzI2NDc1NkUyMTY0NzU2RTIxIiwKICAibmFtZXMiOiBbXQp9
