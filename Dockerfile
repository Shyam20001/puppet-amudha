# Use the official Puppeteer Docker image as base
FROM ghcr.io/puppeteer/puppeteer:latest

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of your application code to the container
COPY . .

# Expose the port your application runs on
EXPOSE 3000

# Command to run your application using npm start
CMD [ "npm", "start" ]
