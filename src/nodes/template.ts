import { buildSwitch } from "..";
import type { Observable } from "../observables";

// TODO: check at compile time that 
// substitution count in `template` matches `observables` length

type Node = {
        observerId: symbol,
        staticNode: Text,
        dynamicNode: Text | undefined
    };

export const template = (
    template: string,
    ...observables: Observable<string>[]
) => new Template(template, observables).toNode();

class Template {
    constructor(
        private template: string, 
        private observables: Observable<string>[]
    ) { }

    toNode() {
        const nodes = this.buildNodes();
        const commentNode = document.createComment('Template');

        return Object.assign(commentNode, buildSwitch({
            activate: () => {
                this.appendNodes(nodes, commentNode);
                for (const [i, observable] of this.observables.entries())
                    this.attachObservable(nodes[i], observable);
            },
            deactivate: () => {
                this.removeNodes(nodes, commentNode);
                for (const [i, observable] of this.observables.entries())
                    this.detachObservable(nodes[i], observable);
            }
        }));
    }

    private buildNodes() {
        const staticParts = this.template.split(/(?<!@)\?/)
            .map((staticPart) => staticPart.replace('@?', '?'));

        return staticParts.map((staticPart, i) => ({
            observerId: Symbol(`Template${i}`),
            staticNode: document.createTextNode(staticPart),
            dynamicNode: i + 1 in staticParts ? document.createTextNode('') : undefined
        }));
    }

    private appendNodes(nodes: Node[], commentNode: Comment) {
        const parentNode = commentNode.parentNode;

        if (parentNode === null)
            return console.warn("Node wasn't mounted before activation");

        for (const { staticNode, dynamicNode } of nodes) {
            parentNode.appendChild(staticNode);
            if (dynamicNode !== undefined) parentNode.appendChild(dynamicNode);
        }
    };

    private attachObservable(node: Node | undefined, observable: Observable<string>) {
        if (node === undefined) return;
        if (node.dynamicNode === undefined) return;
        observable.subscribeInit(
            node.observerId, (value) => (node.dynamicNode as Text).data = value);
    };

    private removeNodes(nodes: Node[], commentNode: Comment) {
        const parentNode = commentNode.parentNode;

        if (parentNode === null)
            return console.warn("Node wasn't mounted before deactivation");

        for (const { staticNode, dynamicNode } of nodes) {
            parentNode.removeChild(staticNode);
            if (dynamicNode !== undefined) parentNode.removeChild(dynamicNode);
        }
    };

    private detachObservable(node: Node | undefined, observable: Observable<string>) {
        if (node === undefined) return;
        observable.unsubscribe(node.observerId);
    };
}
