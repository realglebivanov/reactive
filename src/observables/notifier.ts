import type { Observer } from ".";

export class Notifier<T> {
    private observers = new Map<symbol, Observer<T>>();
    private notifyAll = false;
    private notifySchedule = new Set<symbol>();

    get size(): number {
        return this.observers.size;
    }

    scheduleNotify(id: symbol) {
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

    set(id: symbol, observer: Observer<T>) {
        if (this.observers.has(id))
            console.warn("Duplicate observer id", id);
        this.observers.set(id, observer);
    }

    delete(id: symbol) {
        this.observers.delete(id);
    }

    notifyTargets(value: T) {
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

    private notify(observer: Observer<T> | undefined, value: T) {
        try {
            if (observer !== undefined) observer(value);
        } catch (e) {
            console.error(e);
        }
    }
}
