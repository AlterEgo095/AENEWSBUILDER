# Use Node.js for the base image
FROM node:alpine

# Set the working directory
WORKDIR /app/studio

# Copy package.json and yarn.lock files
COPY package.json yarn.lock ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Build the application using Vite
RUN npm run build

# Create a non-root user and switch to it
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose the production-ready application port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]
