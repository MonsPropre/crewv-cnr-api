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

# Générer Prisma et faire les migrations
RUN pnpm run vercel-build

EXPOSE 8153

# Démarrage
CMD pnpm start