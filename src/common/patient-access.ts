import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * A therapist is "linked" to a patient (may read their records and receives
 * their crisis alerts) when either:
 *  - they share a CONFIRMED or COMPLETED appointment, or
 *  - the patient chose to share their records with them (TherapistConnection.sharedAt),
 *    which the patient can switch off again at any time.
 * Merely tapping "Chat on WhatsApp" (contactedAt) does NOT grant access.
 */
export async function isTherapistLinked(prisma: PrismaService, therapistId: string, patientId: string): Promise<boolean> {
  const [appointment, shared] = await Promise.all([
    prisma.appointment.findFirst({
      where: { therapistId, patientId, status: { in: ['CONFIRMED', 'COMPLETED'] } },
      select: { id: true },
    }),
    prisma.therapistConnection.findFirst({
      where: { therapistId, patientId, sharedAt: { not: null } },
      select: { id: true },
    }),
  ]);
  return !!appointment || !!shared;
}

/** Throws 403 unless the therapist is linked to the patient (see isTherapistLinked). */
export async function assertTherapistPatientLink(
  prisma: PrismaService,
  therapistId: string,
  patientId: string,
): Promise<void> {
  if (!(await isTherapistLinked(prisma, therapistId, patientId))) {
    throw new ForbiddenException('This patient is not linked to you');
  }
}

/** Every therapist linked to a patient, by either route, without duplicates. */
export async function linkedTherapistIds(prisma: PrismaService, patientId: string): Promise<string[]> {
  const [appointments, shared] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId, status: { in: ['CONFIRMED', 'COMPLETED'] } },
      select: { therapistId: true },
      distinct: ['therapistId'],
    }),
    prisma.therapistConnection.findMany({
      where: { patientId, sharedAt: { not: null } },
      select: { therapistId: true },
    }),
  ]);
  return [...new Set([...appointments, ...shared].map((r) => r.therapistId))];
}
