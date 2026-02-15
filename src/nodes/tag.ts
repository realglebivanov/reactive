import { reactiveTextNode } from '.';
import {
    toTagReactiveNode,
    type ReactiveNode,
    type TagReactiveNode
} from '../reactive/extensions';

export type InputChild<
    T extends Node,
    K extends keyof HTMLElementTagNameMap = keyof HTMLElementTagNameMap
> = TagReactiveNode<K> | ReactiveNode<T> | string;

export const tag = <
    K extends keyof HTMLElementTagNameMap
>(name: K, ...inputChildren: InputChild<Node>[]): TagReactiveNode<K> => {
    const node = document.createElement(name);
    const children: ReactiveNode<Node>[] = [];

    for (const child of inputChildren) {
        if (typeof (child) === 'string') {
            children.push(reactiveTextNode(child));
        } else if (child instanceof Node) {
            children.push(child);
        } else {
            throw new Error('Unsupported child type');
        }
    }

    return toTagReactiveNode<K>(node, [{
        mount: (parentNode: Node) => {
            parentNode.appendChild(node);
            for (const child of children) child.mount(node);
        },
        activate: () => {
            for (const child of children) child.activate();
        },
        deactivate: () => {
            for (const child of children) child.deactivate();
        },
        unmount: () => {
            for (const child of children) child.unmount();
            node.remove();
        }
    }]);
}

export const tags = {
    img: (src: string): TagReactiveNode<'img'> => tag('img').att('src', src),
    input: (type: string): TagReactiveNode<'input'> => tag('input').att('type', type),
    canvas: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'canvas'> => tag('canvas', ...children),
    button: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'button'> => tag('button', ...children),
    h1: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'h1'> => tag('h1', ...children),
    h2: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'h2'> => tag('h2', ...children),
    h3: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'h3'> => tag('h3', ...children),
    p: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'p'> => tag('p', ...children),
    a: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'a'> => tag('a', ...children),
    div: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'div'> => tag('div', ...children),
    ul: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'ul'> => tag('ul', ...children),
    li: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'li'> => tag('li', ...children),
    span: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'span'> => tag('span', ...children),
    select: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'select'> => tag('select', ...children),
    option: <T extends InputChild<Node>[]>(...children: T): TagReactiveNode<'option'> => tag('option', ...children)
};
