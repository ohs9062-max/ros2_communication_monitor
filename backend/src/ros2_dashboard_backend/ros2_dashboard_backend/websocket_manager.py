"""WebSocket 관리의 websocket_manager 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any

from fastapi import WebSocket, WebSocketDisconnect


class WebSocketManager:
    """WebSocket 관리의 WebSocketManager 역할을 담당하는 클래스입니다."""

    def __init__(self) -> None:
        """WebSocket 관리에서 내부 보조 처리를 수행하는 내부 helper 함수입니다."""
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        """WebSocket 관리에서 WebSocket client를 연결하는 함수입니다."""
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """WebSocket 관리에서 WebSocket client를 연결하는 함수입니다."""
        self._clients.discard(websocket)

    async def send_json(
        self,
        websocket: WebSocket,
        payload: dict[str, Any],
    ) -> bool:
        """WebSocket 관리에서 요청된 처리를 수행하는 함수입니다."""
        try:
            await websocket.send_json(payload)
        except (RuntimeError, WebSocketDisconnect):
            self.disconnect(websocket)
            return False

        return True
