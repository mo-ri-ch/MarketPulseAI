# Use official lightweight Python image
FROM python:3.13-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set workspace directory
WORKDIR /app

# Install system dependencies (build-essential needed for compiling certain packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy python dependencies list
COPY requirements.txt requirements_crawl.txt ./

# Install python dependencies
RUN pip install --no-cache-dir -r requirements.txt -r requirements_crawl.txt

# Copy backend source code
COPY . .

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Expose port 8000
EXPOSE 8000

# Start FastAPI server using uvicorn
CMD ["sh", "entrypoint.sh"]
