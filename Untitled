# Use the official Puppeteer image (Includes Node + Chrome)
FROM ghcr.io/puppeteer/puppeteer:21.5.2

# Switch to root user to install dependencies/copy files
USER root

# Set the working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies (skipping Chrome download since it's in the base image)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm install

# Copy the rest of your app code
COPY . .

# Expose the port (Render usually uses 10000, but we use the env var)
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]