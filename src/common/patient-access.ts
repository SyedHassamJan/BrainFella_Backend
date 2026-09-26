import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * A therapist may read a patient's data only if they share a confirmed or
 * completed appointment (the same rule as GET /user/patients). Throws 403
 * otherwise. Shared by questionnaire and screening history.
 */
export async function assertTherapistPatientLink(
  prisma: PrismaService,
  therapistId: string,
  patientId: string,
): Promise<void> {
  const link = await prisma.appointment.findFirst({
    where: {
      therapistId,
      patientId,
      status: { in: ['CONFIRMED', 'COMPLETED'] },
    },
    select: { id: true },
  });
  if (!link) {
    throw new ForbiddenException('This patient is not linked to you');
  }
}
