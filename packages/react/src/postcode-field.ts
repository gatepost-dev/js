// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import '@gatepost/field';
import type {
  ChangeDetail,
  ConfirmDetail,
  ErrorDetail,
  Messages,
  PostcodeFieldElement,
} from '@gatepost/field';
import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ForwardedRef,
  type ForwardRefExoticComponent,
  type ReactElement,
  type RefAttributes,
} from 'react';

/**
 * The props of `PostcodeField`. Each one sets the attribute of the same name on the element,
 * and `spec/field.md` defines each one.
 */
export interface PostcodeFieldProps {
  /** The name of the form value. */
  readonly name?: string;
  /** The text in the input at first. The user changes it from then on. */
  readonly defaultValue?: string;
  /** True when the form needs a postcode. */
  readonly required?: boolean;
  /** True turns the field off, and the form leaves it out. */
  readonly disabled?: boolean;
  /** The visible label. The default is `Postcode`. */
  readonly label?: string;
  /** A publishable key. Without a key, the field sends no request. */
  readonly apiKey?: string;
  /** The gateway's address. The default is NIPOST's gateway. */
  readonly baseUrl?: string;
  /** The lookup level of the check: `none`, `level1` or `level2`. The default is `level1`. */
  readonly confirm?: 'none' | 'level1' | 'level2';
  /** True shows the location button, when the field has a key. */
  readonly gps?: boolean;
  /** Whether an old 6-digit postcode is a form value. The default is `accept`. */
  readonly legacy?: 'accept' | 'reject';
  /** Messages that replace the English ones, by key. */
  readonly messages?: Partial<Messages>;
  /** Called when the form value changes through the user. */
  readonly onChange?: (detail: ChangeDetail) => void;
  /** Called when the gateway knows the postcode. */
  readonly onConfirm?: (detail: ConfirmDetail) => void;
  /** Called when a request or the location fails, or for a secret key. */
  readonly onError?: (detail: ErrorDetail) => void;
}

// React 18 writes `false` to a custom element as the text "false", which still counts as a
// present attribute. So a boolean becomes an empty attribute or no attribute at all.
function flag(on: boolean | undefined): '' | undefined {
  return on === true ? '' : undefined;
}

// A layout effect runs before the browser paints, so the first paint shows the right text. A
// server runs no effect, and React 18 warns about a layout effect there.
const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

// Gives the element to a ref of the caller. A callback ref of React 19 may return a cleanup, which
// React then runs in place of a call with null.
function forward(
  ref: ForwardedRef<PostcodeFieldElement>,
  element: PostcodeFieldElement,
): (() => void) | undefined {
  if (typeof ref === 'function') {
    const cleanup = (ref as (attached: PostcodeFieldElement) => unknown)(element);
    return typeof cleanup === 'function' ? (cleanup as () => void) : undefined;
  }
  if (ref !== null) {
    ref.current = element;
  }
  return undefined;
}

function sameMessages(
  left: Partial<Messages> | undefined,
  right: Partial<Messages> | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  const keys = Object.keys(left) as (keyof Messages)[];
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

interface Details {
  'gatepost-change': ChangeDetail;
  'gatepost-confirm': ConfirmDetail;
  'gatepost-error': ErrorDetail;
}

function useEvent<Type extends keyof Details>(
  element: PostcodeFieldElement | null,
  type: Type,
  handler: ((detail: Details[Type]) => void) | undefined,
): void {
  useEffect(() => {
    if (element === null || handler === undefined) {
      return undefined;
    }
    const listener = (event: Event): void => {
      handler((event as CustomEvent<Details[Type]>).detail);
    };
    element.addEventListener(type, listener);
    return () => {
      element.removeEventListener(type, listener);
    };
  }, [element, type, handler]);
}

function render(props: PostcodeFieldProps, ref: ForwardedRef<PostcodeFieldElement>): ReactElement {
  const [element, setElement] = useState<PostcodeFieldElement | null>(null);
  const attach = useCallback(
    (attached: PostcodeFieldElement | null): (() => void) | undefined => {
      setElement(attached);
      if (attached !== null) {
        const cleanup = forward(ref, attached);
        return cleanup === undefined
          ? undefined
          : () => {
              cleanup();
              setElement(null);
            };
      }
      if (typeof ref === 'function') {
        ref(null);
      } else if (ref !== null) {
        ref.current = null;
      }
      return undefined;
    },
    [ref],
  );
  // The element keeps the messages that it holds until a new object replaces them, so the effect
  // sends an object only when its keys or texts changed, and an empty object when it went away.
  const { messages, defaultValue } = props;
  const [first] = useState(defaultValue);
  const applied = useRef<{
    element: PostcodeFieldElement | null;
    messages: Partial<Messages> | undefined;
  }>({ element: null, messages: undefined });
  useBeforePaint(() => {
    if (element === null) {
      return;
    }
    if (applied.current.element !== element) {
      applied.current = { element, messages: undefined };
    }
    if (!sameMessages(applied.current.messages, messages)) {
      applied.current.messages = messages;
      element.messages = messages ?? {};
    }
  }, [element, messages]);
  // `defaultValue` is the attribute `value`: the first text, which a form reset restores. The
  // server writes it as an attribute, and so does React 18. React 19 sets a prop of a custom
  // element as a property when the element has one of that name, and the property `value` is
  // the current text. So the prop keeps the first value for ever, and this effect writes each
  // value as the attribute. A later value then changes the first text, never the typed text.
  useBeforePaint(() => {
    if (element === null) {
      return;
    }
    if (defaultValue === undefined) {
      element.removeAttribute('value');
    } else if (element.getAttribute('value') !== defaultValue) {
      element.setAttribute('value', defaultValue);
    }
  }, [element, defaultValue]);
  useEvent(element, 'gatepost-change', props.onChange);
  useEvent(element, 'gatepost-confirm', props.onConfirm);
  useEvent(element, 'gatepost-error', props.onError);
  return createElement('gatepost-postcode-field', {
    ref: attach,
    name: props.name,
    value: first,
    label: props.label,
    'api-key': props.apiKey,
    'base-url': props.baseUrl,
    confirm: props.confirm,
    legacy: props.legacy,
    required: flag(props.required),
    disabled: flag(props.disabled),
    gps: flag(props.gps),
  });
}

/**
 * The postcode field of `@gatepost/field` as a React component. The server renders the element
 * with its attributes, and the browser upgrades it. A plain form submits its form value, so the
 * component needs no state of its own. The ref gives the element.
 *
 * @example
 * ```tsx
 * import { PostcodeField } from '@gatepost/react';
 *
 * <PostcodeField name="postcode" required onChange={(detail) => detail.value} />;
 * ```
 */
export const PostcodeField: ForwardRefExoticComponent<
  PostcodeFieldProps & RefAttributes<PostcodeFieldElement>
> = forwardRef(render);
