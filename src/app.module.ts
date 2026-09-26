import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';
import { TherapistModule } from './therapist/therapist.module';
import { AppointmentModule } from './appointment/appointment.module';
import { JournalModule } from './journal/journal.module';
import { MoodModule } from './mood/mood.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { CbtModule } from './cbt/cbt.module';
import { ReportModule } from './report/report.module';
import { AdminModule } from './admin/admin.module';
import { QuestionnaireModule } from './questionnaire/questionnaire.module';
import { ScreeningModule } from './screening/screening.module';

@Module({
  imports: [
    // Global config — loads .env
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // Global Prisma — provides PrismaService to all modules
    PrismaModule,
    // Global Notification — provides NotificationService to all modules
    NotificationModule,
    // Cron job scheduler
    ScheduleModule.forRoot(),
    // Feature modules
    AuthModule,
    UserModule,
    TherapistModule,
    AppointmentModule,
    JournalModule,
    MoodModule,
    ChatbotModule,
    CbtModule,
    ReportModule,
    AdminModule,
    QuestionnaireModule,
    ScreeningModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
