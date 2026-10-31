FROM node:24.22.1-bookworm-slim
WORKDIR /opt/living-universe
RUN npm install --global pnpm@11.25.0 --ignore-scripts
COPY --chown=node:node package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --chown=node:node app ./app
COPY --chown=node:node mcp ./mcp
COPY --chown=node:node tests ./tests
COPY --chown=node:node ops ./ops
COPY --chown=node:node docs ./docs
COPY --chown=node:node config-templates ./config-templates
COPY --chown=node:node AGENTS.md README.md RECOVERY.md PROJECT_VISION.md DECISIONS.md DEVELOPMENT_PLAN.md .gitignore .env.example .node-version ./
ENV LU_IMAGE_DECODER=portable
USER node
ENTRYPOINT ["node"]
CMD ["ops/testing/run-tests.mjs"]
