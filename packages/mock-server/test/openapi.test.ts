// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Every body that the mock server builds must match the completed OpenAPI file in the spec. The
// spec checks its fixtures. This test checks the bodies that the code builds or changes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { REVERSE_RADIUS_M } from '../src/search.ts';
import { FILES, mockRequest, SPEC_DIR, sent } from './mock-request.ts';

interface ResponseObject {
  readonly $ref?: string;
  readonly content?: unknown;
  readonly headers?: Readonly<Record<string, { readonly $ref: string }>>;
  readonly 'x-gatepost-error-codes'?: Readonly<Record<string, string>>;
}

interface Operation {
  readonly parameters?: readonly {
    readonly name: string;
    readonly schema: Record<string, unknown>;
  }[];
  readonly responses: Readonly<Record<string, ResponseObject>>;
}

const openapi = parse(readFileSync(join(SPEC_DIR, 'openapi/gateway.completed.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, Operation>>;
  components: {
    responses: Record<string, ResponseObject>;
    headers: Record<string, { schema: Record<string, unknown> }>;
  };
  'x-gatepost-unknown-path': { responses: Record<string, ResponseObject> };
};
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(openapi, 'openapi');

// The response of the operation and the status, or the file's answer to a path that it lacks.
function declaredResponse(path: string, method: string, status: number): ResponseObject {
  const responses =
    openapi.paths[path]?.[method]?.responses ?? openapi['x-gatepost-unknown-path'].responses;
  const response = responses[String(status)];
  const shared = response?.$ref?.split('/').at(-1);
  const declared = shared === undefined ? response : openapi.components.responses[shared];
  if (declared === undefined) {
    throw new Error(`The OpenAPI file declares no ${String(status)} for ${method} ${path}.`);
  }
  return declared;
}

function bodySchema(declared: ResponseObject): string {
  const media = (declared.content as { 'application/json': { schema: { $ref: string } } })[
    'application/json'
  ];
  return `openapi${media.schema.$ref}`;
}

// Each header that the response declares is there and has a value of the declared type.
function expectDeclaredHeaders(
  declared: ResponseObject,
  headers: Readonly<Record<string, string>>,
): void {
  for (const [name, reference] of Object.entries(declared.headers ?? {})) {
    const value = headers[name];
    if (name !== 'Retry-After') {
      expect(value, `${name} is missing`).toBeDefined();
    }
    if (value !== undefined) {
      const header = openapi.components.headers[reference.$ref.split('/').at(-1) ?? ''];
      expect(ajv.validate(header?.schema ?? false, Number(value)), `${name}: ${value}`).toBe(true);
    }
  }
}

// An error code is one of the codes that the response lists.
function expectDeclaredCode(declared: ResponseObject, body: unknown): void {
  const codes = declared['x-gatepost-error-codes'];
  const code = (body as { error?: { code?: string } }).error?.code;
  if (codes !== undefined && code !== undefined) {
    expect(Object.keys(codes)).toContain(code);
  }
}

interface Probe {
  readonly target: string;
  readonly method?: string;
  readonly key?: string;
  readonly origin?: string;
  readonly anonymous?: boolean;
  readonly body?: string;
}

const SEGMENTS = '{"state":"fc","lga":"1","district":"z99","area":"zz","unit":"1"}';
const PROBES: readonly Probe[] = [
  { target: '/v1/lookup?code=fc01z99zz01&level=3' },
  { target: '/v1/lookup?code=FC01Z99ZZ01&level=2' },
  { target: '/v1/lookup?code=HELLO' },
  { target: '/v1/lookup?code=FC01Z99ZZ02' },
  { target: '/v1/lookup?code=FC01Z99ZZ01&level=5' },
  { target: '/v1/lookup?level=1' },
  { target: '/v1/lookup?code=FC01Z99ZZ01', key: 'nipost_test_mock_no_scope' },
  { target: '/v1/lookup?code=FC01Z99ZZ01&level=2', key: 'nipost_test_mock_no_credits' },
  { target: '/v1/lookup?code=FC01Z99ZZ01', key: 'nipost_test_mock_rate_limited' },
  { target: '/v1/lookup?code=FC01Z99ZZ01', key: 'nipost_test_unknown' },
  { target: '/v1/search/reverse?lat=9&lng=7&max_distance_m=900' },
  { target: '/v1/search/reverse?lat=9.001&lng=7.001' },
  { target: '/v1/search/reverse?lat=0.5&lng=0.25' },
  { target: '/v1/search/nearby?lat=9&lng=7' },
  { target: '/v1/search/autocomplete?q=E' },
  { target: '/v1/search/autocomplete?q=FC01Z99ZZ0' },
  { target: '/v1/search/autocomplete?q=EK01' },
  { target: '/v1/assembly/assemble', method: 'POST', body: SEGMENTS },
  { target: '/v1/assembly/disassemble?code=FC01Z99ZZ01' },
  { target: '/v1/assembly/disassemble?code=HELLO' },
  { target: '/v1/widget/lookup' },
  { target: '/v1/lookup?code=FC01Z99ZZ01', anonymous: true },
  { target: '/v1/lookup?code=FC01Z99ZZ01', key: 'nipost_pk_test_mock', origin: 'http://x.test' },
  { target: '/v1/search/reverse?lat=9', key: 'nipost_test_mock_l1' },
  { target: '/v1/search/reverse?lat=9&lng=7', key: 'nipost_test_mock_rate_limited' },
  { target: '/v1/search/nearby?lat=9' },
  { target: '/v1/search/autocomplete?q=FC01Z99ZZ011' },
  { target: '/v1/assembly/assemble', method: 'POST', body: '{}' },
];

describe('the bodies of the mock server', () => {
  it.each(PROBES)('match the OpenAPI file for $target', (probe) => {
    const method = probe.method ?? 'GET';
    const headers: Record<string, string> = {};
    if (probe.anonymous !== true) {
      headers['x-api-key'] = probe.key ?? 'nipost_test_mock_l3';
    }
    if (probe.origin !== undefined) {
      headers['origin'] = probe.origin;
    }
    const request = mockRequest(probe.target, { method, headers, body: probe.body ?? '' });
    const response = sent(createGateway(FILES, () => 0)(request));
    const declared = declaredResponse(request.path, method.toLowerCase(), response.status);
    const validate = ajv.getSchema(bodySchema(declared));
    expect(validate?.(response.body), JSON.stringify(validate?.errors)).toBe(true);

    expectDeclaredHeaders(declared, response.headers);
    // A reply with no key declares no rate-limit header, and the mock server sends none.
    if (probe.anonymous === true) {
      expect(Object.keys(response.headers)).not.toContain('X-RateLimit-Limit');
    }
    expectDeclaredCode(declared, response.body);
  });
});

describe('the reverse radius', () => {
  it('has the default and the ceiling of the OpenAPI file', () => {
    const parameter = openapi.paths['/v1/search/reverse']?.['get']?.parameters?.find(
      ({ name }) => name === 'max_distance_m',
    );
    expect(parameter?.schema).toMatchObject(REVERSE_RADIUS_M);
  });
});
