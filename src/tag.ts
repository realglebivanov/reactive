import {
    toTagReactiveNode,
    type Lifecycle,
    type ReactiveNode,
    type TagReactiveNode
} from './nodes/reactive';

export type InputChild<
    T extends Node,
    K extends keyof HTMLElementTagNameMap = keyof HTMLElementTagNameMap
> = TagReactiveNode<K> | ReactiveNode<T> | string;

export const tag = <
    K extends keyof HTMLElementTagNameMap
>(name: K, ...children: InputChild<Node>[]): TagReactiveNode<K> => {
    const node = document.createElement(name);
    const handlers: Lifecycle[] = [];

    for (const child of children) {
        if (typeof (child) === 'string') {
            node.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            handlers.push(child);
            node.appendChild(child);
        }
    }

    return toTagReactiveNode<K>(node, handlers);
}

export const tags = {
    img: (src: string) => tag('img').att('src', src),
    input: (type: string) => tag('input').att('type', type),
    canvas: <T extends InputChild<Node>[]>(...children: T) => tag('canvas', ...children),
    button: <T extends InputChild<Node>[]>(...children: T) => tag('button', ...children),
    h1: <T extends InputChild<Node>[]>(...children: T) => tag('h1', ...children),
    h2: <T extends InputChild<Node>[]>(...children: T) => tag('h2', ...children),
    h3: <T extends InputChild<Node>[]>(...children: T) => tag('h3', ...children),
    p: <T extends InputChild<Node>[]>(...children: T) => tag('p', ...children),
    a: <T extends InputChild<Node>[]>(...children: T) => tag('a', ...children),
    div: <T extends InputChild<Node>[]>(...children: T) => tag('div', ...children),
    ul: <T extends InputChild<Node>[]>(...children: T) => tag('ul', ...children),
    li: <T extends InputChild<Node>[]>(...children: T) => tag('li', ...children),
    span: <T extends InputChild<Node>[]>(...children: T) => tag('span', ...children),
    select: <T extends InputChild<Node>[]>(...children: T) => tag('select', ...children)
};
