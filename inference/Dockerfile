FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY predictor.py server.py artifact-manifest.json ./
COPY vendor ./vendor
USER 65534:65534
ENV SALLY_NANO_HOST=0.0.0.0 PORT=8765 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
EXPOSE 8765
CMD ["python", "server.py"]
