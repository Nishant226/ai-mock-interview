FROM python:3.10-slim

WORKDIR /app

# OpenCV aur MediaPipe ke liye zaroori system-level dependencies
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libxcb1 \
    libegl1 \
    libgles2 \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies copy aur install karein
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Baaki saara source code copy karein
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]