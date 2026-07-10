"""Small WebSocket connection manager for monitor snapshots."""

from __future__ import annotations

from typing import Any

from fastapi import WebSocket, WebSocketDisconnect


class WebSocketManager:
    """Track connected WebSocket clients and send JSON payloads."""

    def __init__(self) -> None:
        """Initialize an empty client set."""
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register a WebSocket client."""
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket client if it is currently tracked."""
        self._clients.discard(websocket)

    async def send_json(
        self,
        websocket: WebSocket,
        payload: dict[str, Any],
    ) -> bool:
        """Send JSON to one client and return whether it succeeded."""
        try:
            await websocket.send_json(payload)
        except (RuntimeError, WebSocketDisconnect):
            self.disconnect(websocket)
            return False

        return True
