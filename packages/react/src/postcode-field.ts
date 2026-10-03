// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
'use client';
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

function forward(
  ref: ForwardedRef<PostcodeFieldElement>,
  element: PostcodeFieldElement | null,
): void {
  if (typeof ref === 'function') {
    ref(element);
  } else if (ref !== null) {
    ref.current = element;
  }
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
    (attached: PostcodeFieldElement | null) => {
      setElement(attached);
      forward(ref, attached);
    },
    [ref],
  );
  const { messages } = props;
  useEffect(() => {
    if (element !== null && messages !== undefined) {
      element.messages = messages;
    }
  }, [element, messages]);
  useEvent(element, 'gatepost-change', props.onChange);
  useEvent(element, 'gatepost-confirm', props.onConfirm);
  useEvent(element, 'gatepost-error', props.onError);
  return createElement('gatepost-postcode-field', {
    ref: attach,
    name: props.name,
    value: props.defaultValue,
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
