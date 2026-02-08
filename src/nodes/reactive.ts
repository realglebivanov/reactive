import { toReactiveNode } from "../reactive";

export const reactiveTextNode = (text: string) => {
    const textNode = document.createTextNode(text);
    const hooks = [{
        mount: (parentNode: Node) => parentNode.appendChild(textNode),
        activate: () => undefined,
        deactivate: () => undefined,
        unmount: () => textNode.remove()
    }];

    return toReactiveNode(textNode, hooks);
}
