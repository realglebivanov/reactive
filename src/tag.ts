import { buildSwitch, type Lifecycle } from '.';
import type { Observable } from './observables';

export type DomObject = Node & Lifecycle;

export interface Setters {
    att: (name: string, value: string) => Setters
    att$: (name: string, value: Observable<string>) => Setters
    clk: (cb: EventListenerOrEventListenerObject) => Setters
}

type InputChild = string | Child;
type Child = Lifecycle & Setters;

export const tag = <
    K extends keyof HTMLElementTagNameMap
>(name: K, ...children: InputChild[]): Child & HTMLElementTagNameMap[K] => {
    const node = document.createElement(name);
    const handlers: Lifecycle[] = [];

    for (const child of children) {
        if (typeof (child) === 'string') {
            node.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            node.appendChild(child);
            handlers.push(child);
        }
    }

    const setters = {
        att: function (name: string, value: string) {
            node.setAttribute(name, value);
            return this;
        },
        att$: function (name: string, value$: Observable<string>) {
            const subscriberId = Symbol(`Attribute: ${name}`)

            handlers.push({
                activate: () => value$.subscribeInit(
                    subscriberId,
                    (value: string) => node.setAttribute(name, value)),
                deactivate: () => value$.unsubscribe(subscriberId)
            });

            return this;
        },
        clk: function (callback: EventListenerOrEventListenerObject) {
            handlers.push({
                activate: () => node.addEventListener('click', callback),
                deactivate: () => node.removeEventListener('click', callback)
            });
            return this;
        },
    };

    return Object.assign(node, Object.assign(setters, buildSwitch({
        activate: () => {
            for (const handler of handlers) handler.activate();
        },
        deactivate: () => {
            for (const handler of handlers) handler.deactivate();
        }
    })));
}

export const tags = {
    img: (src: string) => tag('img').att('src', src),
    input: (type: string) => tag('input').att('type', type),
    canvas: (...children: InputChild[]) => tag('canvas', ...children), 
    button: (...children: InputChild[]) => tag('button', ...children), 
    h1: (...children: InputChild[]) => tag('h1', ...children), 
    h2: (...children: InputChild[]) => tag('h2', ...children), 
    h3: (...children: InputChild[]) => tag('h3', ...children), 
    p: (...children: InputChild[]) => tag('p', ...children), 
    a: (...children: InputChild[]) => tag('a', ...children), 
    div: (...children: InputChild[]) => tag('div', ...children), 
    ul: (...children: InputChild[]) => tag('ul', ...children), 
    li: (...children: InputChild[]) => tag('li', ...children), 
    span: (...children: InputChild[]) => tag('span', ...children), 
    select: (...children: InputChild[])  => tag('select', ...children)
};
