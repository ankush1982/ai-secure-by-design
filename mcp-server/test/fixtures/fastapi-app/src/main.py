# Sample app: run from the project root as `uvicorn src.main:app`. The scaffolds use relative
# imports, so the folder that holds privacy/, security/ and ai/ must be a package (here, src).
from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request

from .ai.decision_log import DecisionContext, decision_log
from .ai.human_oversight import require_physician_review
from .privacy.consent import ConsentRecord, require_consent
from .privacy.dsr_handler import EraseResult, Nominee, RetainedRecord, dsr_router
from .security.audit_log import audit_log
from .security.rbac import requires
from .security.security_headers import SecurityHeadersMiddleware


class MemoryConsentStore:
    def __init__(self) -> None:
        self.records: list[ConsentRecord] = []

    async def insert(self, record: ConsentRecord) -> str:
        self.records.append(record)
        return str(len(self.records))

    async def find_active(self, data_principal_id: str, purpose: str) -> ConsentRecord | None:
        matches = [r for r in self.records if (r.data_principal_id, r.purpose) == (data_principal_id, purpose)]
        return matches[-1] if matches else None

    async def withdraw(self, consent_id: str, when: Any) -> None:
        del self.records[int(consent_id) - 1]

    async def list_for(self, data_principal_id: str) -> list[ConsentRecord]:
        return [r for r in self.records if r.data_principal_id == data_principal_id]


class HeaderDsrAdapter:
    def __init__(self) -> None:
        self.corrections: list[dict[str, Any]] = []

    async def verify_requester_identity(self, request: Request) -> str | None:
        return request.headers.get('x-principal')

    async def collect_personal_data(self, data_principal_id: str) -> dict[str, Any]:
        return {'id': data_principal_id}

    async def apply_corrections(self, data_principal_id: str, changes: dict[str, Any]) -> None:
        self.corrections.append(changes)

    async def erase_or_anonymize(self, data_principal_id: str) -> EraseResult:
        return EraseResult(erased=['profile'], retained=[RetainedRecord('billing', 'legal hold')])

    async def record_grievance(self, data_principal_id: str, message: str) -> str:
        return 'T-1'

    async def record_nomination(self, data_principal_id: str, nominee: Nominee) -> None:
        return None


async def triage_model() -> dict[str, str]:
    return {'suggestion': 'rest'}


def create_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)
    app.include_router(dsr_router(), prefix='/api/dpdp/dsr')

    @app.middleware('http')
    async def fake_auth(request: Request, call_next: Any) -> Any:
        actor = request.headers.get('x-actor')
        if actor:
            request.state.user = {'id': actor}
        return await call_next(request)

    @app.post('/patients', dependencies=[Depends(requires('patient:create'))], status_code=201)
    async def create_patient() -> dict[str, bool]:
        await audit_log.event('patient.create', actor='sample')
        return {'created': True}

    @app.get('/triage/{patient_id}')
    async def triage(patient_id: str) -> dict[str, Any]:
        await require_consent(patient_id, 'triage')
        result = await decision_log(
            DecisionContext(system_name='triage', actor='sample', data_principal_id=patient_id, input_category_names=['patient-clinical']),
            triage_model,
        )
        reviewed = await require_physician_review('triage', result, data_principal_id=patient_id)
        return reviewed.output

    @app.get('/boom')
    async def boom() -> None:
        raise HTTPException(status_code=418)

    return app


app = create_app()
