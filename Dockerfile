# Use Node 18
FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your app source code
COPY . .

# Build the React app
RUN npm run build

# Install a simple static server globally
RUN npm install -g serve

# --- CRITICAL STEP: Start the app on Port 8080 ---
# "dist" is for Vite. If you use Create-React-App, change "dist" to "build"
CMD ["serve", "-s", "dist", "-l", "8080"]
