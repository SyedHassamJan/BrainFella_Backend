import { BadRequestException } from '@nestjs/common';

import { QuestionnaireService } from './questionnaire.service';

describe('QuestionnaireService.submit crisis handling', () => {
  let prisma: any;
  let notifications: { createNotification: jest.Mock; notifyLinkedTherapistsOfCrisis: jest.Mock };
  let service: QuestionnaireService;

  beforeEach(() => {
    prisma = { questionnaireResponse: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'q1', ...data })) } };
    notifications = { createNotification: jest.fn().mockResolvedValue({}), notifyLinkedTherapistsOfCrisis: jest.fn().mockResolvedValue(0) };
    service = new QuestionnaireService(prisma, notifications as any);
  });

  it('PHQ-9 item 9 above zero alerts the patient AND linked therapists, and returns support text', async () => {
    const r = await service.submit('u1', 'PHQ9', [0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(r.crisisFlag).toBe(true);
    expect(r.crisisSupport).toMatch(/0317-4288665/);
    expect(notifications.createNotification).toHaveBeenCalledWith('u1', expect.any(String), expect.any(String), 'CRISIS_DETECTED');
    expect(notifications.notifyLinkedTherapistsOfCrisis).toHaveBeenCalledWith('u1', 'questionnaire');
  });

  it('item 9 at zero (even with a high total) alerts no one', async () => {
    const r = await service.submit('u1', 'PHQ9', [3, 3, 3, 3, 3, 3, 3, 3, 0]);
    expect(r.crisisFlag).toBe(false);
    expect(notifications.createNotification).not.toHaveBeenCalled();
    expect(notifications.notifyLinkedTherapistsOfCrisis).not.toHaveBeenCalled();
  });

  it('other instruments never raise the crisis alert', async () => {
    await service.submit('u1', 'GAD7', [3, 3, 3, 3, 3, 3, 3]);
    expect(notifications.notifyLinkedTherapistsOfCrisis).not.toHaveBeenCalled();
  });

  it('invalid answers are rejected before anything is stored or alerted', async () => {
    await expect(service.submit('u1', 'PHQ9', [1, 2])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.questionnaireResponse.create).not.toHaveBeenCalled();
    expect(notifications.notifyLinkedTherapistsOfCrisis).not.toHaveBeenCalled();
  });
});
