# Imagen para publicar el sistema en internet (Render, Railway, Hugging Face Spaces, etc.).
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt requirements-camara.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-camara.txt
COPY api ./api
COPY motor ./motor
COPY conocimiento ./conocimiento
COPY modelos ./modelos
COPY web/dist ./web/dist
COPY consola.py ./
EXPOSE 8000
# Render y otros servicios indican el puerto en la variable PORT.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*"]
