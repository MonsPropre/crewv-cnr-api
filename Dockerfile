FROM node:20-alpine

# Installer pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Installer les dépendances
RUN pnpm install

# Copier le reste du code
COPY . .

# Générer SEULEMENT le client Prisma (pas de migration)
RUN pnpm exec prisma generate

EXPOSE 3000

# Migrations + démarrage (au runtime, pas au build)
CMD pnpm exec prisma migrate deploy && pnpm start