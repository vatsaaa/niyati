FROM node:20-alpine

WORKDIR /workspace

# Install build tools for any native deps
RUN apk add --no-cache python3 make gcc g++ libc-dev

# Copy only package manifests first (leverage Docker cache)
COPY be/bff-auth/package*.json /workspace/be/bff-auth/
COPY be/bff-platform/package*.json /workspace/be/bff-platform/

# Copy only the code and tests required for the e2e / jest runs
COPY be/bff-auth /workspace/be/bff-auth
COPY be/bff-platform /workspace/be/bff-platform
COPY be/commons /workspace/be/commons
COPY be/migrations /workspace/be/migrations
COPY be/scripts /workspace/be/scripts

# Install dependencies per service (dev deps included so Jest is available)
RUN npm --prefix /workspace/be/bff-auth ci --silent
RUN npm --prefix /workspace/be/bff-platform ci --silent || true

WORKDIR /workspace

ENV NODE_ENV=development

# Run Jest test suites inside the compose network; `BFF_BASE` defaults to the
# platform service address inside the network. The command runs bff-auth tests
# first, then bff-platform tests. It returns non-zero if any suite fails.
CMD ["sh", "-c", "export BFF_BASE=${BFF_BASE:-http://bff-platform:3000/api/v1} && npm --prefix /workspace/be/bff-auth test && npm --prefix /workspace/be/bff-platform test"]
