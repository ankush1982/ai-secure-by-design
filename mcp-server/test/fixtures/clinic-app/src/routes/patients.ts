import { Router } from 'express';
import { auditLog } from '../security/audit_log';

export const router = Router();

router.post('/patients', async (req, res) => {
  const patient = await db.patient.create({ data: req.body });
  auditLog({ actor: req.user.id, action: 'patient.create', target: patient.id });
  res.json(patient);
});

router.delete('/patients/:id', async (req, res) => {
  await db.patient.delete({ where: { id: req.params.id } });
  res.sendStatus(204);
});

router.get('/patients/:id', async (req, res) => {
  const patient = await db.patient.findUnique({ where: { id: req.params.id } });
  console.log('loaded patient', patient.email);
  res.json(patient);
});
