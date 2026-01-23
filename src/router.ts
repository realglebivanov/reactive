import type { DomObject } from "./tag";
import { tags } from "./tag";

export const router = (routes: Record<string, DomObject>) => {
    const instance = tags.div();

    let currentRoute: DomObject | undefined;

    function syncHash() {
        let hashLocation = document.location.hash.split('#')[1];
        if (!hashLocation) {
            hashLocation = '/';
        }

        if (!(hashLocation in routes)) {
            // TODO(#2): make the route404 customizable in the router component
            const route404 = '/404';

            console.assert(route404 in routes);
            hashLocation = route404;
        }

        currentRoute?.deactivate();
        currentRoute = routes[hashLocation];
        
        if (currentRoute !== undefined) {
            instance.replaceChildren(currentRoute);
            currentRoute.activate();
        }
    };

    syncHash();

    // TODO(#3): there is way to "destroy" an instance of the router to make it remove it's "hashchange" callback
    window.addEventListener("hashchange", syncHash);

    return instance;
};
