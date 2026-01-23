export interface Lifecycle {
    activate: () => void,
    deactivate: () => void,
}

export type Task = () => void;
export type TaskRunner = (task: Task) => void;

export * from './tag';
export * from './observables';
export * from './nodes';
export * from './router';

export const buildMicrotaskRunner = (): TaskRunner => {
    const tasks = new Set<Task>();
    const enqueue = () => queueMicrotask(() => {
        const run = Array.from(tasks);
        tasks.clear();
        for (const task of run) task();
    });

    return (task: Task) => {
        if (tasks.has(task)) return;
        tasks.add(task);
        if (tasks.size > 1) return;
        enqueue();
    };
};

export const microtaskRunner = buildMicrotaskRunner();

export const ensureSwitch = <T>(node: T & Partial<Lifecycle>): T & Lifecycle => {
    if (node.activate === undefined) node.activate = () => undefined;
    if (node.deactivate === undefined) node.deactivate = () => undefined;
    return node as T & Lifecycle;
}

export const buildSwitch = ({ activate, deactivate }: Lifecycle): Lifecycle => {
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
};


import { component } from './nodes';
import { observable } from './observables';
import { tags } from './tag';
import { router } from './router';

const r = router({
    '/': component({
        cache: false,
        observables: () => ({ x: observable(42, { microtaskRunner }) }),
        derivedObservables: () => ({}),
        render: ({ x }) => {
            x.subscribeInit(Symbol(), (x: number) => console.log(x));
            return tags.div();
        }
    })
});

document.body.appendChild(r);