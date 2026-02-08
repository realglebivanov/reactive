import { toReactiveNode, type ReactiveNode } from "./reactive";
import { microtaskRunner } from "./task";

type RouteKey<T extends RouteCollection<Node>> = keyof T & string;
type Route<T extends RouteCollection<Node>> = T[RouteKey<T>];
type RouteCollection<N extends Node> = Record<string, ReactiveNode<N>>;
type RouterOpts<T extends RouteCollection<Node>> = {
    notFoundRoute: RouteKey<T>;
};

export const router = <
    T extends RouteCollection<Node>
>(routes: T, opts: RouterOpts<T>): ReactiveNode<Comment> => 
    new Router<T>(routes, opts).toReactiveNode();

class Router<T extends RouteCollection<Node>> {
    private anchor: Comment | undefined;
    private currentRoute: Route<T> | undefined;
    private hashChangeListener = () => this.syncHash();

    constructor(
        private routes: T,
        private opts: RouterOpts<T>
    ) { }

    toReactiveNode() {
        const anchor = document.createComment('Router');

        return toReactiveNode(anchor, [{
            mount: (parentNode: HTMLElement) => {
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

    private syncHash() {
        const newRoute = this.getNewRoute();

        if (newRoute === this.currentRoute || newRoute === undefined) return;

        this.currentRoute?.deactivate();
        this.currentRoute?.unmount();
        this.currentRoute = newRoute;

        microtaskRunner(() => {
            const parentElement = this.anchor?.parentElement;
            if (parentElement === null || parentElement === undefined) return;
            newRoute.mount(parentElement);
            newRoute.activate();
        });
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
