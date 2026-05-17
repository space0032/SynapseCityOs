FROM python:3.10-slim

# Install system dependencies required for OpenCV and YOLOv8
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir opencv-python-headless requests ultralytics numpy

WORKDIR /app

COPY camera_feed.py .

CMD ["python", "camera_feed.py"]
