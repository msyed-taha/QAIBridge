"""
Module 7 – QNN Converter  (FastAPI Router – STUB)
Full implementation to be developed by team member.
"""
from fastapi import APIRouter
router = APIRouter(prefix="/api/module7", tags=["Module 7 – QNN Converter"])

@router.get("/status")
async def status():
    return {"module": 7, "name": "QNN Converter", "status": "stub – not yet implemented"}
