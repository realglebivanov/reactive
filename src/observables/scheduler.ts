import { RingQueue } from "../ring.queue";

export interface Schedulable {
    run(): void;
}

export type Scheduler = {
    enqueueSubscription: (task: Schedulable) => void;
    enqueueUpdate: (task: Schedulable) => void;
}

enum Status {
    Scheduled,
    Idle
}

const buildScheduleFun = () => {
    const flushIds: WeakMap<Schedulable, number> = new WeakMap();

    let flushId = 0;
    let status = Status.Idle;

    let tasks: RingQueue<Schedulable> = new RingQueue();
    let nextTasks: RingQueue<Schedulable> = new RingQueue();

    const runner = () => {
        while (true) {
            [tasks, nextTasks] = [nextTasks, tasks];
            nextTasks.clear();

            let task: Schedulable | undefined;
            while (task = tasks.dequeue()) task.run();

            if (nextTasks.isEmpty) break;
        }
    };

    const enqueueMicrotask = () => queueMicrotask(() => {
        runner();
        status = Status.Idle;
        flushId++;
    });

    return (task: Schedulable) => {
        const taskFlushId = flushIds.get(task);
        if (taskFlushId === flushId) return;

        flushIds.set(task, flushId);
        nextTasks.enqueue(task);

        if (status === Status.Scheduled) return;

        status = Status.Scheduled;
        enqueueMicrotask();
    };
};

export const scheduler: Scheduler = {
    enqueueSubscription: buildScheduleFun(),
    enqueueUpdate: buildScheduleFun()
};
