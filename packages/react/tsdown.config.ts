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

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  // A bundler drops the directive of a module that it joins with others, and Next.js needs it
  // at the top of the file that it imports.
  banner: { js: "'use client';", dts: packageComment() },
  clean: true,
});
