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
  components: { responses: Record<string, ResponseObject> };
  'x-gatepost-unknown-path': { responses: Record<string, ResponseObject> };
};
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(openapi, 'openapi');

// The response of the operation and the status, or the file's answer to a path that it lacks.
function bodySchema(path: string, method: string, status: number): string {
  const responses =
    openapi.paths[path]?.[method]?.responses ?? openapi['x-gatepost-unknown-path'].responses;
  const response = responses[String(status)];
  const shared = response?.$ref?.split('/').at(-1);
  const content =
    shared === undefined ? response?.content : openapi.components.responses[shared]?.content;
  const media = (content as { 'application/json': { schema: { $ref: string } } })[
    'application/json'
  ];
  return `openapi${media.schema.$ref}`;
}

interface Probe {
  readonly target: string;
  readonly method?: string;
  readonly key?: string;
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
];

describe('the bodies of the mock server', () => {
  it.each(PROBES)('match the OpenAPI file for $target', (probe) => {
    const method = probe.method ?? 'GET';
    const headers = { 'x-api-key': probe.key ?? 'nipost_test_mock_l3' };
    const request = mockRequest(probe.target, { method, headers, body: probe.body ?? '' });
    const response = sent(createGateway(FILES, () => 0)(request));
    const validate = ajv.getSchema(bodySchema(request.path, method.toLowerCase(), response.status));
    expect(validate?.(response.body), JSON.stringify(validate?.errors)).toBe(true);
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
