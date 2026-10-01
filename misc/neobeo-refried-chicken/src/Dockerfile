FROM python:3.12-slim

# Basic hardening + smaller image
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install runtime deps
RUN pip install --no-cache-dir flask gunicorn

# Copy app + assets
COPY app.py /app/app.py
COPY flag.txt /app/flag.txt
COPY static/ /app/static/

# Run as non-root
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 1337

# Gunicorn in front of Flask (better than python app.py)
CMD ["gunicorn", "-b", "0.0.0.0:1337", "-w", "2", "app:app"]
