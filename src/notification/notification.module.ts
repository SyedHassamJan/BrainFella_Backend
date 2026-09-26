import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { MailService } from 'src/common/mail.service';

@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, MailService],
  exports: [NotificationService],
})
export class NotificationModule {}
