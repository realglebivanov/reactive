export type Task = () => void;
export type TaskRunner = (task: Task) => void;

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

export const microtaskRunner: TaskRunner = buildMicrotaskRunner();
