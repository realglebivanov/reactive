export type Task = () => void;
export type TaskRunner = (task: Task) => void;

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