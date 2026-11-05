# One image for all bots; the container command picks the bot (python -m bots <name>).
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    ENV=production

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY core ./core
COPY bots ./bots

EXPOSE 8080
CMD ["python", "-m", "bots", "anabelle"]
