from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from pathlib import Path
import json

from .pipeline import run_pipeline

app = FastAPI(title="Allica GTM Take-Home (Hosted)")

class RunBody(BaseModel):
    leads: Optional[List[Dict[str, Any]]] = None

@app.post("/run")
async def run(body: RunBody):
    leads = body.leads
    if not leads:
        # default to bundled data
        data_path = Path("data/leads_small.json")
        try:
            leads = json.loads(data_path.read_text(encoding="utf-8"))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load default leads: {e}")
    try:
        return run_pipeline(leads)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
