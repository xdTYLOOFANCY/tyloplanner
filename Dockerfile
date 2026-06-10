FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY static/ static/

ENV DB_PATH=/data/tyloplanner.db
ENV PORT=8000
VOLUME /data
EXPOSE 8000

CMD ["python", "app.py"]
