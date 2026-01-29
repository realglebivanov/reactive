import type { ReactiveNode } from "./nodes";

type RouteKey<T> = keyof T & string;
type Route<T extends RouteCollection<Node>> = T[keyof T];
type RouteCollection<N extends Node> = Record<string, ReactiveNode<N>>;
type RouterOpts<T extends RouteCollection<Node>> = {
    notFoundRoute: RouteKey<T>;
};

export const router = <
    T extends RouteCollection<Node>
>(routes: T, opts: RouterOpts<T>) => new Router<T>(routes, opts);

class Router<T extends RouteCollection<Node>> {
    private parent: HTMLElement | undefined = undefined;
    private currentRoute: Route<T> | undefined = undefined;
    private hashChangeListener = () => this.syncHash();

    constructor(
        private routes: T, 
        private opts: RouterOpts<T>
    ) { }

    mount(parent: HTMLElement) {
        if (this.parent !== undefined)
            return console.warn("Router is already mounted");
        this.parent = parent;
        window.addEventListener("hashchange", this.hashChangeListener);
        this.syncHash();
    }

    unmount() {
        this.currentRoute?.deactivate();
        if (this.currentRoute !== undefined)
            this.parent?.removeChild(this.currentRoute);
        this.parent = undefined;
        this.currentRoute = undefined;
        window.removeEventListener("hashchange", this.hashChangeListener);
    }

    private syncHash() {
        const newRoute = this.getNewRoute();
        if (newRoute === this.currentRoute) return;
        if (newRoute === undefined) return;

        this.currentRoute?.deactivate();
        this.replaceRoute(newRoute);
        newRoute.activate();
        this.currentRoute = newRoute;
    }

    private replaceRoute(newRoute: Route<T>) {
        if (this.currentRoute === undefined) {
            this.parent?.appendChild(newRoute);
        } else {
            this.parent?.replaceChild(newRoute, this.currentRoute);
        }
    }

    private getNewRoute(): Route<T> | undefined {
        const hashLocation = location.hash.slice(1) || "/";

        const routeKey: RouteKey<T> = this.isRouteKey(hashLocation)
            ? hashLocation
            : this.opts.notFoundRoute;

        return this.routes[routeKey];
    }

    private isRouteKey(key: string): key is RouteKey<T> { 
        return key in this.routes;
    }
}