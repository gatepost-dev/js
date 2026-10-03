// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

// The bundler drops the package comment of src/index.ts from the declarations, and API Extractor
// reads that comment from the top of dist/index.d.ts. So the build puts the comment back.
function packageComment(): string {
  const source = readFileSync(new URL('./src/index.ts', import.meta.url), 'utf8');
  const comments = source.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
  const comment = comments.find((text) => text.includes('@packageDocumentation'));
  if (comment === undefined) {
    throw new Error('src/index.ts has no doc comment with the tag @packageDocumentation.');
  }
  return comment;
}

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    banner: { dts: packageComment() },
    clean: true,
  },
  {
    // One file with the core and the client inside, for a page that loads the field with a
    // plain script tag, and for the WordPress plugin, which cannot install npm packages.
    entry: { element: 'src/index.ts' },
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    dts: false,
    deps: { alwaysBundle: [/^@gatepost\//] },
  },
]);
