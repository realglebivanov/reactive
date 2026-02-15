import { RingQueue } from "../ring.queue";

export interface Schedulable {
    run(): void;
}

export type SchedulerApi = {
    enqueueInit: (task: Schedulable) => void;
    enqueueUpdate: (task: Schedulable) => void;
}

enum Status {
    Scheduled,
    Idle
}

class Scheduler {
    private readonly flushIds: WeakMap<Schedulable, number> = new WeakMap();
    private readonly tasks: RingQueue<Schedulable> = new RingQueue();
    private flushId = 0;
    private status = Status.Idle;

    schedule(task: Schedulable): void {
        if (this.flushIds.get(task) === this.flushId) return;

        this.flushIds.set(task, this.flushId);
        this.tasks.enqueue(task);

        this.enqueueMicrotask();
    }

    private enqueueMicrotask() {
        if (this.status === Status.Scheduled) return;
        this.status = Status.Scheduled;
        queueMicrotask(() => {
            this.flushTasks();
            this.status = Status.Idle;
            this.flushId++;
        });
    }

    private flushTasks() {
        let task: Schedulable | undefined;
        while (task = this.tasks.dequeue()) 
            task.run();
    }
}

const initScheduler = new Scheduler();
const updateScheduler = new Scheduler();

export const scheduler: SchedulerApi = {
    enqueueInit: (task: Schedulable) => initScheduler.schedule(task),
    enqueueUpdate: (task: Schedulable) => updateScheduler.schedule(task),
};
