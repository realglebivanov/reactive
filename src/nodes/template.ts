import type { Observable } from "../observables";
import { toReactiveNode } from "./reactive";

// TODO: check at compile time that 
// substitution count in `template` matches `observables` length

type PartialTextNode = {
        observerId: symbol,
        staticNode: Text,
        dynamicNode: Text | undefined
    };

export const template = (
    template: string,
    ...observables: Observable<string>[]
) => new Template(template, observables).toReactiveNode();

class Template {
    constructor(
        private template: string, 
        private observables: Observable<string>[]
    ) { }

    toReactiveNode() {
        const nodes = this.buildNodes();
        const commentNode = document.createComment('Template');

        return toReactiveNode(commentNode, [{
            mount: (parentNode: Node) => this.appendNodes(parentNode, nodes),
            activate: () => {
                for (const [i, observable] of this.observables.entries())
                    this.attachObservable(nodes[i], observable);
            },
            deactivate: () => {
                for (const [i, observable] of this.observables.entries())
                    this.detachObservable(nodes[i], observable);
            },
            unmount: () => this.removeNodes(nodes),
        }]);
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

    private appendNodes(parentNode: Node, nodes: PartialTextNode[]) {
        for (const { staticNode, dynamicNode } of nodes) {
            parentNode.appendChild(staticNode);
            if (dynamicNode !== undefined) parentNode.appendChild(dynamicNode);
        }
    };

    private attachObservable(node: PartialTextNode | undefined, observable: Observable<string>) {
        if (node === undefined) return;
        if (node.dynamicNode === undefined) return;
        observable.subscribeInit(
            node.observerId, (value) => (node.dynamicNode as Text).data = value);
    };

    private removeNodes(nodes: PartialTextNode[]) {
        for (const { staticNode, dynamicNode } of nodes) {
            staticNode.remove()
            if (dynamicNode !== undefined) dynamicNode.remove();
        }
    };

    private detachObservable(node: PartialTextNode | undefined, observable: Observable<string>) {
        if (node === undefined) return;
        observable.unsubscribe(node.observerId);
    };
}
