import { EmotionLabel } from 'src/types/enums';
import * as hf from 'src/common/huggingface';
import { MoodService } from './mood.service';

describe('MoodService.create', () => {
  let prisma: any;
  let notifications: { createNotification: jest.Mock; notifyLinkedTherapistsOfCrisis: jest.Mock };
  let service: MoodService;

  beforeEach(() => {
    prisma = { moodLog: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'm1', ...data })) } };
    notifications = { createNotification: jest.fn().mockResolvedValue({}), notifyLinkedTherapistsOfCrisis: jest.fn().mockResolvedValue(0) };
    service = new MoodService(prisma, notifications as any);
    jest.spyOn(hf, 'detectTextEmotion').mockResolvedValue(null);
  });
  afterEach(() => jest.restoreAllMocks());

  it('stores the tone of the note next to the chosen mood, without changing the mood', async () => {
    jest.spyOn(hf, 'detectTextEmotion').mockResolvedValue({ emotion: 'anger', score: 0.93 });
    const log: any = await service.create('u1', { mood: EmotionLabel.joy, intensity: 8, note: 'fuck you' });
    expect(log).toMatchObject({ mood: 'joy', detectedEmotion: 'anger', emotionScore: 0.93, isCrisis: false });
  });

  it('no note means no tone, and a model outage stores null rather than a fake neutral', async () => {
    const spy = jest.spyOn(hf, 'detectTextEmotion');
    const noNote: any = await service.create('u1', { mood: EmotionLabel.joy, intensity: 5 });
    expect(spy).not.toHaveBeenCalled();
    expect(noNote.detectedEmotion).toBeNull();
    const outage: any = await service.create('u1', { mood: EmotionLabel.joy, intensity: 5, note: 'ok day' });
    expect(outage.detectedEmotion).toBeNull();
  });

  it('a violent threat in the note is a crisis whatever mood is picked', async () => {
    const log: any = await service.create('u1', { mood: EmotionLabel.joy, intensity: 9, note: 'I will rape you' });
    expect(log.isCrisis).toBe(true);
    expect(notifications.notifyLinkedTherapistsOfCrisis).toHaveBeenCalledWith('u1', 'mood');
  });

  it('"Calm" with an alarming note is still flagged, alerts the patient and linked therapists, and returns support text', async () => {
    const log: any = await service.create('u1', { mood: EmotionLabel.neutral, intensity: 3, note: 'I am ona kils you' });
    expect(log.isCrisis).toBe(true);
    expect(log.crisisSupport).toMatch(/Umang/);
    expect(notifications.createNotification).toHaveBeenCalledWith('u1', expect.any(String), expect.any(String), 'CRISIS_DETECTED');
    expect(notifications.notifyLinkedTherapistsOfCrisis).toHaveBeenCalledWith('u1', 'mood');
  });

  it('an ordinary check-in (with or without a note) alerts no one', async () => {
    for (const note of [undefined, 'had a good walk']) {
      const log: any = await service.create('u1', { mood: EmotionLabel.joy, intensity: 7, note });
      expect(log.isCrisis).toBe(false);
      expect(log.crisisSupport).toBeUndefined();
    }
    expect(notifications.createNotification).not.toHaveBeenCalled();
    expect(notifications.notifyLinkedTherapistsOfCrisis).not.toHaveBeenCalled();
  });
});
