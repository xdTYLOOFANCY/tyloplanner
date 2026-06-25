FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py helpers.py scheduler.py ./
COPY blueprints/ blueprints/
COPY static/ static/
COPY migrations/ migrations/

ENV DB_PATH=/data/tyloplanner.db
ENV PORT=8000
VOLUME /data
EXPOSE 8000

CMD ["python", "app.py"]
