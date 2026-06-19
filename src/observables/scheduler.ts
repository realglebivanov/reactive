export interface Schedulable {
    readonly depth: number;
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
    // One bucket per depth. Order *within* a bucket is irrelevant: two nodes at
    // the same depth can never depend on each other (an edge always increases
    // depth), so a bucket is drained as a plain stack rather than a FIFO queue.
    private readonly buckets: Schedulable[][] = [];
    private size = 0;
    private flushId = 0;
    private status = Status.Idle;

    schedule(task: Schedulable): void {
        if (this.flushIds.get(task) === this.flushId) return;

        this.flushIds.set(task, this.flushId);

        const depth = task.depth;
        let bucket = this.buckets[depth];
        if (bucket === undefined) bucket = this.buckets[depth] = [];
        bucket.push(task);
        this.size++;

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
        while (task = this.dequeue())
            task.run();
    }

    private dequeue(): Schedulable | undefined {
        if (this.size === 0) return undefined;

        for (const bucket of this.buckets) {
            if (bucket === undefined || bucket.length === 0) continue;
            this.size--;
            return bucket.pop();
        }

        return undefined;
    }
}

const initScheduler = new Scheduler();
const updateScheduler = new Scheduler();

export const scheduler: SchedulerApi = {
    enqueueInit: (task: Schedulable) => initScheduler.schedule(task),
    enqueueUpdate: (task: Schedulable) => updateScheduler.schedule(task),
};
