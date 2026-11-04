import asyncio
import dataclasses
import unittest
from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from src import main
from src.ai import decision_log as dl
from src.ai import human_oversight as ho
from src.privacy import breach_notifier as bn
from src.privacy import children_gate as cg
from src.privacy import consent as cs
from src.privacy import dsr_handler as dsr
from src.privacy import retention_runner as rr
from src.security import audit_log as al
from src.security import phi_redaction as phi
from src.security import rbac


class Capture:
    def __init__(self) -> None:
        self.items: list[Any] = []

    async def write(self, item: Any) -> None:
        self.items.append(item)


def consent(principal: str = 'p1', purpose: str = 'triage') -> cs.ConsentRecord:
    return cs.ConsentRecord(
        data_principal_id=principal, purpose=purpose, category='patient-clinical', basis='explicit',
        notice_version='v1', consent_text_hash=cs.hash_consent_text('text'), language='en',
        given_by_actor='self', channel='web',
    )


class Reviewer:
    def __init__(self, decision: str, modifications: Any = None) -> None:
        self.decision = decision
        self.modifications = modifications

    async def request_review(self, request: ho.ReviewRequest) -> ho.OversightDecision:
        return ho.OversightDecision(
            approver='dr-1', approver_role='physician', decision=self.decision,  # type: ignore[arg-type]
            decided_at=datetime.now(timezone.utc), modifications=self.modifications,
        )


class Scaffolds(unittest.TestCase):
    def setUp(self) -> None:
        # Adapters are module globals: start every test from an unconfigured app.
        for module, name in [(cs, '_store'), (dsr, '_adapter'), (rbac, '_store'), (rr, '_adapter'),
                             (bn, '_notifier'), (cg, '_verifier'), (ho, '_adapter'), (dl, '_preview_redactor')]:
            setattr(module, name, None)
        self.audit = Capture()
        self.decisions = Capture()
        al.set_audit_sink(self.audit)
        dl.set_decision_sink(self.decisions)
        al.configure_redaction([])
        self.client = TestClient(main.create_app(), raise_server_exceptions=False)

    def actions(self) -> list[str]:
        return [e.action for e in self.audit.items]

    def test_adapters_fail_closed_when_not_configured(self) -> None:
        self.assertEqual(self.client.get('/api/dpdp/dsr/access', headers={'x-principal': 'p1'}).status_code, 500)
        self.assertEqual(self.client.post('/patients', headers={'x-actor': 'a1'}).status_code, 500)
        self.assertEqual(self.client.get('/triage/p1').status_code, 500)
        rule = rr.RetentionRule('c', 1, 't', 'created_at', 'hard-delete')
        for call in [
            cs.verify_consent('p1', 'x'),
            cs.list_consents('p1'),
            rr.run_retention([rule]),
            ho.require_physician_review('triage', {}),
            cg.verify_parental_consent(cg.ChildContext('c1', 10, 'p', 'c', 'v', 'h', 'mother', 'x')),
        ]:
            with self.assertRaisesRegex(RuntimeError, 'secure-by-design'):
                asyncio.run(call)

    def test_breach_is_logged_before_failing_closed(self) -> None:
        report = bn.BreachReport(datetime.now(timezone.utc), 'leak', ['c'], 3, False, 'critical', 'emp-1')
        with self.assertRaisesRegex(RuntimeError, 'NOT yet reported'):
            asyncio.run(bn.report_breach(report))
        self.assertEqual(self.actions(), ['breach.detected'])
        self.assertEqual(self.audit.items[0].severity, 'CRITICAL')

    def test_security_headers(self) -> None:
        headers = self.client.get('/boom').headers
        self.assertEqual(headers['x-content-type-options'], 'nosniff')
        self.assertEqual(headers['x-frame-options'], 'DENY')
        self.assertIn("frame-ancestors 'none'", headers['content-security-policy'])

    def test_rbac(self) -> None:
        rbac.set_policy_store(rbac.InMemoryPolicyStore({'a1': ['admin'], 'a2': ['nurse']}, {'admin': ['*'], 'nurse': ['patient:read']}))
        self.assertEqual(self.client.post('/patients').status_code, 401)
        denied = self.client.post('/patients', headers={'x-actor': 'a2'})
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.client.post('/patients', headers={'x-actor': 'a1'}).status_code, 201)
        self.assertEqual([e.outcome for e in self.audit.items if e.action == 'rbac.check'], ['denied', 'success'])

    def test_consent_gate_decision_log_and_oversight(self) -> None:
        store = main.MemoryConsentStore()
        cs.set_consent_store(store)
        self.assertEqual(self.client.get('/triage/p1').status_code, 451)

        asyncio.run(cs.record_consent(consent()))
        ho.set_oversight_adapter(Reviewer('modified', {'suggestion': 'see a doctor'}))
        response = self.client.get('/triage/p1')
        self.assertEqual(response.json(), {'suggestion': 'see a doctor'})
        record = self.decisions.items[0]
        self.assertEqual(record.outcome, 'success')
        self.assertEqual(len(record.output_hash), 64)
        self.assertIsNone(record.output_preview, 'preview stays off unless a redactor is set')

        ho.set_oversight_adapter(Reviewer('rejected'))
        self.assertEqual(self.client.get('/triage/p1').status_code, 451)

    def test_expired_and_withdrawn_consent_do_not_count(self) -> None:
        store = main.MemoryConsentStore()
        cs.set_consent_store(store)
        asyncio.run(store.insert(dataclasses.replace(consent(), expires_at=datetime(2000, 1, 1, tzinfo=timezone.utc))))
        self.assertIsNone(asyncio.run(cs.verify_consent('p1', 'triage')))
        asyncio.run(store.insert(dataclasses.replace(consent(), withdrawn_at=datetime.now(timezone.utc))))
        self.assertIsNone(asyncio.run(cs.verify_consent('p1', 'triage')))

    def test_modifications_never_fall_back_to_the_unreviewed_output(self) -> None:
        ho.set_oversight_adapter(Reviewer('modified', {'a': 1}))
        with self.assertRaises(TypeError):
            asyncio.run(ho.require_physician_review('triage', 'plain text'))

    def test_decision_log_preview_and_failures(self) -> None:
        async def ok() -> str:
            return 'mail a@b.co ' + 'x' * 300

        async def bad() -> str:
            raise ValueError('prompt echoed a@b.co')

        ctx = dl.DecisionContext(system_name='s', actor='a', input_category_names=['c'])
        dl.set_preview_redactor(al.redact)
        asyncio.run(dl.decision_log(ctx, ok))
        preview = self.decisions.items[0].output_preview
        self.assertLessEqual(len(preview), 200)
        self.assertNotIn('a@b.co', preview)
        with self.assertRaises(ValueError):
            asyncio.run(dl.decision_log(ctx, bad))
        self.assertEqual(self.decisions.items[1].outcome, 'failure')
        self.assertNotIn('a@b.co', self.decisions.items[1].error)

    def test_dsr_endpoints(self) -> None:
        adapter = main.HeaderDsrAdapter()
        dsr.set_dsr_adapter(adapter)
        cs.set_consent_store(main.MemoryConsentStore())
        who = {'x-principal': 'p1'}
        base = '/api/dpdp/dsr'
        self.assertEqual(self.client.get(f'{base}/access').status_code, 401)
        self.assertEqual(self.client.get(f'{base}/access', headers=who).json(), {'personalData': {'id': 'p1'}, 'consentHistory': []})
        self.assertEqual(self.client.post(f'{base}/correct', headers=who, json={}).status_code, 400)
        self.assertEqual(self.client.post(f'{base}/correct', headers=who, content=b'{').status_code, 400)
        self.assertEqual(self.client.post(f'{base}/correct', headers=who, content=b'x' * (257 * 1024)).status_code, 413)
        self.assertEqual(self.client.post(f'{base}/correct', headers=who, json={'changes': {'city': 'Pune'}}).status_code, 200)
        self.assertEqual(adapter.corrections, [{'city': 'Pune'}])
        self.assertEqual(self.client.post(f'{base}/erase', headers=who).json()['retained'], [{'category': 'billing', 'reason': 'legal hold'}])
        self.assertEqual(self.client.post(f'{base}/grievance', headers=who, json={'message': ''}).status_code, 400)
        self.assertEqual(self.client.post(f'{base}/grievance', headers=who, json={'message': 'hi'}).status_code, 201)
        self.assertEqual(self.client.post(f'{base}/nominate', headers=who, json={'name': 'a'}).status_code, 400)
        self.assertEqual(self.client.post(f'{base}/nominate', headers=who, json={'name': 'a', 'relation': 'b', 'contact': 'c'}).status_code, 200)
        self.assertEqual(self.actions(), ['dsr.access', 'dsr.correct', 'dsr.erase', 'dsr.grievance', 'dsr.nominate'])

    def test_retention_continues_after_a_failing_rule(self) -> None:
        class Flaky:
            async def apply(self, rule: rr.RetentionRule, now: datetime) -> rr.RetentionResult:
                if rule.category == 'bad':
                    raise ValueError('boom')
                return rr.RetentionResult(1, 1, 0, 0, 0)

        rr.set_retention_adapter(Flaky())
        rules = [rr.RetentionRule(c, 1, 't', 'created_at', 'hard-delete') for c in ('bad', 'good')]
        asyncio.run(rr.daily_retention_task(rules)())
        self.assertEqual([e.outcome for e in self.audit.items], ['failure', 'success'])

    def test_redaction(self) -> None:
        @dataclasses.dataclass
        class User:
            email: str
            phone: str

        al.configure_redaction(['Phone'])
        out = al.redact({'u': User('a@b.co', '9876543210'), 'pan': 'ABCDE1234F', 'o': object(), 'n': 1})
        self.assertTrue(out['u']['email'].startswith('pii:'))
        self.assertTrue(out['u']['phone'].startswith('pii:'))
        self.assertTrue(out['pan'].startswith('pii:'))
        self.assertEqual(out['o'], '[REDACTED]')
        self.assertEqual(out['n'], 1)
        self.assertEqual(phi.phi_redact({'diagnosis': 'flu', 'n': 'patient has fever'}), {'diagnosis': '[PHI_REDACTED]', 'n': '[PHI_REDACTED]'})
        self.assertEqual(str(phi.redact_err(ValueError('patient was seen'))), '[PHI_REDACTED]')

    def test_children_gate(self) -> None:
        class Verifier:
            def __init__(self, verified: bool) -> None:
                self.verified = verified

            async def verify(self, request: cg.ParentalConsentRequest) -> cg.ParentalConsentResult:
                return cg.ParentalConsentResult(self.verified, 'otp', datetime.now(timezone.utc), 'hash')

        child = cg.ChildContext('c1', 10, 'triage', 'patient-clinical', 'v1', 'h', 'mother', 'x')
        store = main.MemoryConsentStore()
        cs.set_consent_store(store)
        cg.set_parental_consent_verifier(Verifier(False))
        with self.assertRaises(cg.ParentalConsentRequiredError):
            asyncio.run(cg.verify_parental_consent(child))
        self.assertEqual(store.records, [])
        cg.set_parental_consent_verifier(Verifier(True))
        asyncio.run(cg.verify_parental_consent(child))
        self.assertEqual(store.records[0].given_by_actor, 'parent-guardian')
        with self.assertRaisesRegex(RuntimeError, r'§9\(2\)'):
            cg.refuse_children_profiling('ads')


if __name__ == '__main__':
    unittest.main()
