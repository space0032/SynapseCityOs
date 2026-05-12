FROM python:3.10-slim

RUN pip install --no-cache-dir opencv-python-headless requests

WORKDIR /app

COPY camera_feed.py .

CMD ["python", "camera_feed.py"]
