// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
'use client';
import { useState, type ReactElement } from 'react';
import { PostcodeField } from '@gatepost/react';

export function AddressForm(): ReactElement {
  const [postcode, setPostcode] = useState('');
  return (
    <form action="/address">
      <PostcodeField
        name="postcode"
        required
        onChange={(detail) => {
          setPostcode(detail.value);
        }}
      />
      <p>{postcode}</p>
      <button>Continue</button>
    </form>
  );
}
