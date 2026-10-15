import { Module } from '@nestjs/common';
import { TherapistService } from './therapist.service';
import { TherapistController } from './therapist.controller';
import { TherapistApplicationService } from './therapist-application.service';
import { TherapistConnectionService } from './therapist-connection.service';
import { TherapistConnectionController } from './therapist-connection.controller';
import {
  AdminTherapistApplicationController,
  TherapistApplicationController,
} from './therapist-application.controller';

@Module({
  // These must come before TherapistController: its public ':id' route would
  // otherwise swallow 'application/me' and 'connections/me'.
  controllers: [
    TherapistApplicationController,
    AdminTherapistApplicationController,
    TherapistConnectionController,
    TherapistController,
  ],
  providers: [TherapistService, TherapistApplicationService, TherapistConnectionService],
})
export class TherapistModule {}
