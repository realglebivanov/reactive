import type { Observable } from "../observables";
import { toReactiveNode } from "../reactive/extensions";

type PartialTextNode = {
    staticNodes: Text[],
    dynamicNode: {
        node: Text,
        observerId: symbol,
        observable: Observable<string>
    } | undefined
};

type Hole = Observable<string> | string;

export const template = (
    strings: TemplateStringsArray,
    ...holes: Hole[]
) => new Template(strings, holes).toReactiveNode();

class Template {
    constructor(
        private strings: TemplateStringsArray,
        private holes: Hole[]
    ) { }

    toReactiveNode() {
        const nodes = this.buildNodes();
        const commentNode = document.createComment('Template');

        return toReactiveNode(commentNode, [{
            mount: (parentNode: Node) => this.appendNodes(parentNode, nodes),
            activate: () => {
                for (const node of nodes) this.attachObservable(node);
            },
            deactivate: () => {
                for (const node of nodes) this.detachObservable(node);
            },
            unmount: () => this.removeNodes(nodes),
        }]);
    }

    private buildNodes() {
        return this.strings.map((staticPart, i) => {
            const hole = this.holes[i];
            const partialTextNode: PartialTextNode = {
                staticNodes: [document.createTextNode(staticPart)],
                dynamicNode: undefined
            };

            if (typeof hole === 'string') {
                partialTextNode.staticNodes.push(document.createTextNode(hole));
            } else if (typeof hole === 'object' && hole !== null) {
                partialTextNode.dynamicNode = {
                    node: document.createTextNode(''),
                    observerId: Symbol(`Template${i}`),
                    observable: hole
                };
            }

            return partialTextNode;
        });
    }

    private appendNodes(parentNode: Node, nodes: PartialTextNode[]) {
        for (const { staticNodes, dynamicNode } of nodes) {
            for (const staticNode of staticNodes)
                parentNode.appendChild(staticNode);
            if (dynamicNode !== undefined) 
                parentNode.appendChild(dynamicNode.node);
        }
    };

    private attachObservable(partialTextNode: PartialTextNode) {
        if (partialTextNode === undefined) return;
        if (partialTextNode.dynamicNode === undefined) return;

        const { node, observerId, observable } = partialTextNode.dynamicNode;

        observable.subscribeInit(observerId, (value) => node.data = value);
    };

    private removeNodes(nodes: PartialTextNode[]) {
        for (const { staticNodes, dynamicNode } of nodes) {
            for (const staticNode of staticNodes)
                staticNode.remove();
            if (dynamicNode !== undefined) dynamicNode.node.remove();
        }
    };

    private detachObservable(node: PartialTextNode) {
        if (node.dynamicNode === undefined) return;
        const { observerId, observable } = node.dynamicNode;
        observable.unsubscribe(observerId);
    };
}
