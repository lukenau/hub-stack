# hub-api — FastAPI layer for the Hub PWA (HUB-INTEGRATION §4a container path).
# Binds 0.0.0.0 INSIDE the container; loopback confinement is enforced by the compose
# `127.0.0.1:` host publish (same pattern as the hermes services).
FROM python:3.12-slim

COPY requirements.txt /opt/hub-api/requirements.txt
RUN pip install --no-cache-dir -r /opt/hub-api/requirements.txt

COPY app.py ha_actions.py files.py hub_calendar.py webauthn_gate.py devicekeys.py /opt/hub-api/
COPY chat/ /opt/hub-api/chat/

# Non-root. Uid must match the host data-dir owner (HERMES_UID in deploy/.env — the gateway
# chowns /srv/hub-data to it) or volume writes (HUB_LOG_DIR, passkeys.json) get EACCES.
ARG HUB_UID=1000
RUN useradd --uid "${HUB_UID}" --create-home hubapi
USER hubapi
WORKDIR /opt/hub-api

# Single worker is load-bearing: the WebAuthn challenge cache is in-process.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090"]
