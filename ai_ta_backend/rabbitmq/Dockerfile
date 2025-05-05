FROM python:3.10-slim

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        tesseract-ocr \
        && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# (Optional) Create app directory
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ingest.py .
CMD ["python", "ingest.py"]
