import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import { FusionService } from './fusion/fusion.service';

describe('AssessmentService', () => {
  let prisma: any;
  let signals: { getRecent: jest.Mock };
  let service: AssessmentService;

  const phq9Row = (score: number, answers = Array(9).fill(0)) => ({
    type: 'PHQ9',
    score,
    answers,
    subscores: null,
    createdAt: new Date(Date.now() - 60 * 1000),
  });

  beforeEach(() => {
    prisma = {
      questionnaireResponse: { findMany: jest.fn().mockResolvedValue([]) },
      riskAssessment: {
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'ra1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      appointment: { findFirst: jest.fn() },
    };
    signals = { getRecent: jest.fn().mockResolvedValue([]) };
    service = new AssessmentService(prisma, new FusionService(), signals as any);
  });

  it('scopes every read to the requesting user', async () => {
    prisma.questionnaireResponse.findMany.mockResolvedValue([phq9Row(12)]);
    await service.assess('u1');
    expect(prisma.questionnaireResponse.findMany.mock.calls[0][0].where.userId).toBe('u1');
    expect(signals.getRecent.mock.calls[0][0]).toBe('u1');
  });

  it('fuses the stored inputs and persists the result', async () => {
    prisma.questionnaireResponse.findMany.mockResolvedValue([phq9Row(12)]);
    const r = await service.assess('u1');
    expect(r.depressionRisk).toBe(50);
    expect(r.id).toBe('ra1');
    const saved = prisma.riskAssessment.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({
      userId: 'u1',
      depressionRisk: 50,
      anxietyRisk: null,
      stressRisk: null,
      ocdRisk: null,
      crisisFlag: false,
      confidence: 'high',
      inputsUsed: ['questionnaire'],
    });
    expect(saved.breakdown.method).toMatch(/not a trained model/);
  });

  it('refuses (422) when there is nothing to assess, and stores nothing', async () => {
    await expect(service.assess('u1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.riskAssessment.create).not.toHaveBeenCalled();
  });

  it('still produces an assessment when the only input is a crisis flag', async () => {
    signals.getRecent.mockResolvedValue([
      { modality: 'TEXT', createdAt: new Date(), payload: { crisisFlag: true, source: 'typed' } },
    ]);
    const r = await service.assess('u1');
    expect(r.crisisFlag).toBe(true);
    expect(r.depressionRisk).toBeNull();
    expect(prisma.riskAssessment.create.mock.calls[0][0].data.crisisFlag).toBe(true);
  });

  it('history: own rows only, oldest first', async () => {
    await service.getMyHistory('u1');
    expect(prisma.riskAssessment.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { computedAt: 'asc' },
    });
  });

  describe('therapist access', () => {
    it('is allowed with a confirmed/completed appointment', async () => {
      prisma.appointment.findFirst.mockResolvedValue({ id: 'a1' });
      await service.getPatientHistory('t1', 'p1');
      expect(prisma.appointment.findFirst.mock.calls[0][0].where).toMatchObject({
        therapistId: 't1',
        patientId: 'p1',
        status: { in: ['CONFIRMED', 'COMPLETED'] },
      });
      expect(prisma.riskAssessment.findMany.mock.calls[0][0].where.userId).toBe('p1');
    });

    it('is forbidden (403) without one, and reads nothing', async () => {
      prisma.appointment.findFirst.mockResolvedValue(null);
      await expect(service.getPatientHistory('t1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.riskAssessment.findMany).not.toHaveBeenCalled();
    });
  });
});
