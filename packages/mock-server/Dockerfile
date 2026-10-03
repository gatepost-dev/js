# SPDX-FileCopyrightText: 2026 The Gatepost authors
# SPDX-License-Identifier: Apache-2.0
# Build from the root of the js repo, with the spec submodule checked out:
#   docker build --file packages/mock-server/Dockerfile --tag postcode-mock .
# The mock server has no dependencies and no build. Node runs its TypeScript source.
FROM node:24.18.1-alpine3.24@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3

ARG DESCRIPTION="Unofficial. Not made or endorsed by NIPOST. A mock of NIPOST's gateway."
LABEL org.opencontainers.image.title="postcode-mock" \
      org.opencontainers.image.description="$DESCRIPTION" \
      org.opencontainers.image.source="https://github.com/gatepost-dev/js" \
      org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /app
COPY LICENSE NOTICE ./
COPY spec/data spec/data
COPY spec/fixtures spec/fixtures
COPY spec/contract spec/contract
COPY packages/mock-server/package.json packages/mock-server/package.json
COPY packages/mock-server/src packages/mock-server/src

ENV HOST=0.0.0.0 PORT=4010
USER node
EXPOSE 4010
CMD ["node", "packages/mock-server/src/main.ts"]
