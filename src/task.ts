export type Task = () => void;
export type TaskRunner = (task: Task) => void;

export const buildDedupMicrotaskRunner = (): TaskRunner => {
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

export const dedupMicrotaskRunner = buildDedupMicrotaskRunner();

export const buildMicrotaskRunner = (): TaskRunner => {
    const tasks: Task[] = [];
    const enqueue = () => queueMicrotask(() => {
        const run = tasks.toReversed();
        tasks.length = 0;
        for (const task of run) task();
    });

    return (task: Task) => {
        tasks.push(task);
        if (tasks.length == 1) enqueue();
    };
};

export const microtaskRunner = buildMicrotaskRunner();
