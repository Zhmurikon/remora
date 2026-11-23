from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.api_tokens import AgentScope
from app.services.mcp_oauth import client_name, consent_record, decide

router = APIRouter(prefix="/mcp/consent", tags=["mcp"])


class ConsentView(BaseModel):
    client: str
    scopes: list[str]


class ConsentDecision(BaseModel):
    allow: bool
    scopes: list[AgentScope] = Field(max_length=6)


class ConsentRedirect(BaseModel):
    redirect_uri: str


@router.get("/{ticket}", response_model=ConsentView)
async def read_consent(
    ticket: str, response: Response, user: User = Depends(current_user)
) -> ConsentView:
    pending = await consent_record(ticket)
    response.headers["Cache-Control"] = "no-store"
    scopes = [
        s
        for s in pending.params.scopes or []
        if not s.startswith("blog:") or user.role == UserRole.admin
    ]
    return ConsentView(client=client_name(str(pending.params.redirect_uri)), scopes=scopes)


@router.post("/{ticket}", response_model=ConsentRedirect)
async def consent(
    ticket: str,
    body: ConsentDecision,
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ConsentRedirect:
    response.headers["Cache-Control"] = "no-store"
    return ConsentRedirect(redirect_uri=await decide(db, user, ticket, body.scopes, body.allow))
